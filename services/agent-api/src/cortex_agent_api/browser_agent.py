"""Browser jobs: a Browser Use agent driving the user's Chrome tab through the extension relay.

These jobs run inside the service (not the Docker worker): Browser Use needs the relay's CDP socket,
and its questions must reach the notch while it waits. The job row, events and interactions use the
same tables as other jobs, so the desktop app shows them the same way.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import date
from typing import Any

import httpx2 as httpx  # the Anthropic SDK here is built on httpx2, a fork of httpx

from .database import ConflictError, canonical_json

log = logging.getLogger(__name__)
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")

EXTEND = """
Today is {today}. You are working in the user's own Chrome tab, already open on the page they chose.
Stay in this tab; you cannot open new tabs.
Asking the user (ask_user) interrupts them, so ask rarely:
- Ask only for a detail you cannot reasonably assume. Use sensible defaults instead of asking:
  one-way, 1 adult, economy, the next occurrence of a date, the cheapest option.
- Collect everything missing in ONE question at the start, not one detail at a time.
- An answer is final. Never ask again about something the user already answered or confirmed.
- Searching, filtering, sorting, choosing dates and opening results need no confirmation; just do them.
- Ask for confirmation exactly once: right before the final booking or payment (the step that
  spends money or commits the order), with a one-line summary and the price.
Never type passwords, one-time codes or card details; ask the user to enter those in the tab and
tell you when they are done.
"""


MAX_STEPS = 80

# The agent works in one tab of the user's browser: no web search, other tabs, files or uploads.
UNUSED_ACTIONS = [
    "search",
    "switch",
    "close",
    "upload_file",
    "save_as_pdf",
    "write_file",
    "replace_file",
    "read_file",
    "screenshot",
    "find_elements",
]


def _without_null_cache_control(value):
    if isinstance(value, dict):
        return {
            k: _without_null_cache_control(v)
            for k, v in value.items()
            if not (k == "cache_control" and v is None)
        }
    if isinstance(value, list):
        return [_without_null_cache_control(v) for v in value]
    return value


class OpenRouterAnthropicTransport(httpx.AsyncHTTPTransport):
    """OpenRouter's Anthropic API rejects `"cache_control": null`, which Browser Use sends on
    screenshot messages; Anthropic's own API ignores it. Drop it before the request leaves."""

    async def handle_async_request(self, request):
        if request.method == "POST" and request.content:
            body = _without_null_cache_control(json.loads(request.content))
            headers = [(k, v) for k, v in request.headers.raw if k.lower() != b"content-length"]
            request = httpx.Request(
                request.method,
                request.url,
                headers=headers,
                content=json.dumps(body).encode(),
                extensions=request.extensions,
            )
        return await super().handle_async_request(request)


class BrowserAgents:
    def __init__(self, settings, db, relay, port: int):
        self.settings, self.db, self.relay, self.port = settings, db, relay, port
        self.runs: dict[str, dict[str, Any]] = {}

    def owns(self, task_id: str) -> bool:
        return task_id in self.runs

    def start(self, task_id: str, payload: dict[str, Any]) -> None:
        run = self.runs.setdefault(
            task_id, {"payload": payload, "answer": None, "agent": None, "asked": 0}
        )
        run["task"] = asyncio.create_task(self.run(task_id, run), name=f"browser-job-{task_id}")

    async def state(self, task_id, status, **fields):
        task = await self.db.get_task(task_id)
        progress = {**(task["progress"] if task else {}), "stage": status}
        return await self.db.set_task_state(task_id, status, progress, **fields)

    async def run(self, task_id: str, run: dict[str, Any]) -> None:
        from browser_use import ActionResult, Agent, BrowserSession, Tools

        payload = run["payload"]
        tools = Tools(exclude_actions=UNUSED_ACTIONS)

        @tools.action(
            "Ask the user a question and wait for their answer. Use it for missing details and to "
            "confirm before booking, paying or submitting."
        )
        async def ask_user(question: str) -> ActionResult:
            answer = await self.ask(task_id, run, question)
            return ActionResult(
                extracted_content=f"The user answered: {answer}", long_term_memory=f"User: {answer}"
            )

        async def on_step(state, output, step):
            await self.step(task_id, output, step)

        session = BrowserSession(
            cdp_url=f"ws://127.0.0.1:{self.port}/v1/browser/cdp",
            is_local=False,
            keep_alive=True,
            accept_downloads=False,
            auto_download_pdfs=False,
            enable_default_extensions=False,
        )
        task = payload["task"]
        if payload.get("supporting_documents"):
            task += "\n\nDocuments from the user:\n" + "\n\n".join(
                f"## {doc['name']}\n{doc['content']}" for doc in payload["supporting_documents"]
            )
        try:
            await self.relay.claim(payload["_tab"]["tab_id"])
            await self.state(task_id, "running")
            agent = Agent(
                task=task,
                llm=self.llm(payload),
                browser_session=session,
                tools=tools,
                extend_system_message=EXTEND.format(today=date.today().strftime("%A, %d %B %Y")),
                # Screenshots let it read widgets like date pickers; the page text alone misses them.
                use_vision=True,
                calculate_cost=False,
                use_judge=False,  # an extra graded model call after every job
                register_new_step_callback=on_step,
            )
            run["agent"] = agent
            # Steps are cheap with small models; a tight cap makes the agent rush and ask to stop.
            history = await agent.run(max_steps=MAX_STEPS)
            result = history.final_result()
            if not result:
                # Without a final answer the run failed (e.g. the model provider refused every call).
                raise RuntimeError(
                    next(
                        (e for e in reversed(history.errors()) if e),
                        "The agent stopped before finishing.",
                    )
                )
            if history.is_successful() is False:
                # The agent finished but reports it could not do the task; its message says why.
                raise RuntimeError(result)
            await self.state(task_id, "completed", outcome={"response": result})
            await self.db.append_event(task_id, "task_completed", {})
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # The job shows the reason; the service keeps running.
            log.exception("browser job %s failed", task_id)
            await self.state(
                task_id, "failed", error={"code": "browser_agent", "message": str(exc)[:2000]}
            )
        finally:
            run["agent"] = None
            try:
                await session.stop()
            except Exception:  # The session may already be gone with the tab.
                log.debug("browser session stop failed", exc_info=True)
            if not any(
                other.get("task") and not other["task"].done() and other is not run
                for other in self.runs.values()
            ):
                await self.relay.release()

    def llm(self, payload):
        from browser_use.llm import ChatOpenAI
        from browser_use.llm.anthropic.chat import ChatAnthropic

        if not self.settings.openrouter_api_key:
            raise ConflictError("Save an OpenRouter key in Cortex settings first.")
        model = payload.get("model") or self.settings.openrouter_model
        if model.startswith("anthropic/"):
            # Claude through OpenRouter's Anthropic-compatible API: native tool calls (Claude ignores
            # a JSON format given in the prompt and answers in its tool markup) and prompt caching.
            return ChatAnthropic(
                model=model,
                auth_token=self.settings.openrouter_api_key,
                base_url="https://openrouter.ai/api",
                http_client=httpx.AsyncClient(
                    transport=OpenRouterAnthropicTransport(), timeout=httpx.Timeout(120)
                ),
            )
        # Other models get the reply format in the prompt rather than as a strict schema, which
        # Browser Use's action schema is too large for on some providers.
        return ChatOpenAI(
            model=model,
            api_key=self.settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
            dont_force_structured_output=True,
            add_schema_to_system_prompt=True,
            frequency_penalty=None,
        )

    async def step(self, task_id, output, step):
        goal = getattr(output, "next_goal", None) or ""
        actions = []
        for action in getattr(output, "action", []) or []:
            data = action.model_dump(exclude_unset=True)
            actions.extend(name for name, value in data.items() if value is not None)
        await self.db.append_event(
            task_id,
            "agent_step",
            {"action": ", ".join(actions) or "thinking", "goal": goal[:300], "step": step},
        )

    async def ask(self, task_id, run, question: str) -> str:
        run["asked"] += 1
        task = await self.db.get_task(task_id)
        interaction_id = f"{task_id}:ask:{run['asked']}"
        await self.db.upsert_interaction(
            task_id,
            task["input_revision"],
            {
                "interaction_id": interaction_id,
                "kind": "clarification",
                "operation": "answer_question",
                "payload": {"fields": [{"field": "response", "question": question}]},
                "preview": {"markdown": question},
            },
        )
        run["answer"] = asyncio.get_running_loop().create_future()
        await self.state(task_id, "waiting_input")
        await self.db.append_event(
            task_id,
            "graph_interrupted",
            {"kind": "clarification", "interaction_id": interaction_id},
        )
        try:
            return await run["answer"]
        finally:
            run["answer"] = None
            current = await self.db.get_task(task_id)
            if current and current["status"] == "waiting_input":
                await self.state(task_id, "running")

    async def respond(
        self, task_id: str, interaction_id: str, response: dict[str, Any]
    ) -> dict[str, Any]:
        run = self.runs[task_id]
        interaction = await self.db.fetchrow(
            "SELECT * FROM interactions WHERE id=$1 AND task_id=$2",
            interaction_id,
            uuid.UUID(task_id),
        )
        if not interaction or interaction["state"] != "pending" or not run.get("answer"):
            raise ConflictError("The agent isn't waiting for this answer any more.")
        answer = response.get("answer") or {}
        text = (
            next((str(v) for v in answer.values() if v), "")
            or response.get("feedback")
            or {"approve": "Yes, go ahead.", "reject": "No, stop."}.get(
                response.get("decision"), ""
            )
        )
        await self.db.execute(
            "UPDATE interactions SET state='resolved',response=$2::jsonb,resolved_at=now() WHERE id=$1",
            interaction_id,
            canonical_json(response),
        )
        await self.state(task_id, "running")
        await self.db.append_event(
            task_id, "interaction_resolved", {"interaction_id": interaction_id}
        )
        if not run["answer"].done():
            run["answer"].set_result(text)
        return {
            "interaction_id": interaction_id,
            "state": "resolved",
            "task_version": (await self.db.get_task(task_id))["version"],
        }

    async def message(self, task_id: str, text: str) -> dict[str, Any]:
        """Something typed in the chat while the agent works: it joins the task."""
        run = self.runs[task_id]
        if run.get("answer") and not run["answer"].done():
            run["answer"].set_result(text)
        elif run.get("agent"):
            run["agent"].add_new_task(text)
        else:
            raise ConflictError("The agent has finished. Start a new one.")
        await self.db.append_event(task_id, "user_message", {"text": text[:500]})
        return {"task_id": task_id, "version": (await self.db.get_task(task_id))["version"]}

    async def control(self, task_id: str, action: str, version: int) -> dict[str, Any]:
        run = self.runs[task_id]
        if action == "retry":
            task = await self.db.get_task(task_id)
            if not task or task["status"] != "failed":
                raise ConflictError("only a failed task can be retried")
            await self.state(task_id, "queued")
            self.start(task_id, run["payload"])
        elif action == "cancel":
            await self.db.pause_or_control(task_id, version, "cancel")
            if run.get("task") and not run["task"].done():
                run["task"].cancel()
        elif action == "pause" and run.get("agent"):
            run["agent"].pause()
            await self.state(task_id, "paused")
        elif action == "resume" and run.get("agent"):
            run["agent"].resume()
            await self.state(task_id, "running")
        task = await self.db.get_task(task_id)
        return {
            "task_id": task_id,
            "status": task["status"],
            "version": task["version"],
            "queued_segment_id": None,
        }
