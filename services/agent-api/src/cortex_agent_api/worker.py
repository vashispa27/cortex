from __future__ import annotations

import argparse
import asyncio
import os
import signal
import threading
from typing import Any

from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import Command

from .adapters import DisabledSearchAdapter, FakeSearchAdapter, TavilySearchAdapter
from .agent_graph import FakeBrowserModel, FakePromptModel, PromptModel, build_prompt_graph
from .artifacts import ArtifactStore
from .browser import BrowserClient
from .database import Database, canonical_json
from .settings import Settings
from .tracing import trace_scope
from .workflow import FakeModelAdapter, OpenAIModelAdapter, build_graph


class WorkerStopped(RuntimeError):
    """The control plane paused/cancelled the task or replaced this execution lease."""


def keep_lease(settings, segment_id, token, stop):
    from datetime import timedelta

    import psycopg

    while not stop.wait(max(1, settings.lease_seconds / 3)):
        try:
            with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
                result = connection.execute(
                    "UPDATE execution_segments SET lease_expires_at=now()+%s WHERE id=%s AND lease_token=%s AND state='leased'",
                    (timedelta(seconds=settings.lease_seconds), segment_id, token),
                )
                if not result.rowcount:
                    return
        except psycopg.Error:
            # The manager can reclaim an expired lease; subsequent boundaries check its token.
            continue


def adapters(settings: Settings):
    if settings.model_mode == "fake":
        model = FakeModelAdapter()
    elif settings.model_mode == "openai" and settings.openai_api_key:
        model = OpenAIModelAdapter(settings.openai_api_key, settings.openai_model)
    else:
        raise RuntimeError(
            "model provider is not configured; use CORTEX_AGENT_MODEL_MODE=fake for explicit demo mode"
        )
    if settings.search_mode == "fake":
        search = FakeSearchAdapter()
    elif settings.search_mode == "tavily" and settings.tavily_api_key:
        search = TavilySearchAdapter(settings.tavily_api_key)
    else:
        raise RuntimeError(
            "search provider is not configured; use CORTEX_AGENT_SEARCH_MODE=fake for explicit demo mode"
        )
    return model, search


def prompt_adapters(settings: Settings):
    model = FakePromptModel() if settings.model_mode == "fake" else PromptModel(settings)
    if settings.search_mode == "tavily" and settings.tavily_api_key:
        search = TavilySearchAdapter(settings.tavily_api_key)
    elif settings.search_mode == "fake":
        search = FakeSearchAdapter()
    elif settings.search_mode == "disabled":
        search = DisabledSearchAdapter()
    else:
        raise ValueError(
            "Search configuration is invalid; configure Tavily or set search mode to disabled."
        )
    return model, search


def interrupt_value(result: dict[str, Any]) -> dict[str, Any] | None:
    interrupts = result.get("__interrupt__") or []
    if not interrupts:
        return None
    item = interrupts[0]
    value = getattr(item, "value", item.get("value") if isinstance(item, dict) else None)
    return value if isinstance(value, dict) else None


async def persist_drafts(
    store: ArtifactStore, task_id: str, revision: int, result: dict[str, Any], max_bytes: int
) -> None:
    for name, content in result.get("drafts", {}).items():
        await store.write(
            task_id, revision, name, content.encode(), "text/markdown; charset=utf-8", max_bytes
        )


async def execute(task_id: str, segment_id: str, lease_token: str) -> None:
    settings = Settings()
    browser = (
        BrowserClient(os.environ["CORTEX_BROWSER_ENDPOINT"], os.environ["CORTEX_BROWSER_TOKEN"])
        if os.getenv("CORTEX_BROWSER_ENDPOINT")
        else None
    )
    db = Database(settings.database_url)
    await db.open()
    heartbeat_stop = threading.Event()
    heartbeat = None
    try:
        segment = await db.fetchrow(
            "SELECT * FROM execution_segments WHERE id=$1", __import__("uuid").UUID(segment_id)
        )
        if (
            not segment
            or str(segment["lease_token"]) != lease_token
            or segment["state"] != "leased"
        ):
            return  # fenced stale worker
        task = await db.get_task(task_id)
        if not task or task["status"] in {"cancelled", "paused"}:
            await db.complete_segment(segment_id, lease_token)
            return
        current_inputs = await db.task_inputs(task_id, segment["input_revision"])
        if not current_inputs:
            raise RuntimeError("task input revision is missing")
        inputs = current_inputs["payload"]
        if inputs.get("_execution_profile") not in {None, settings.execution_profile}:
            raise ValueError(
                "This worker's model/search configuration differs from the saved task. Restart any older API/CLI managers and resume with the task's original configuration."
            )
        heartbeat = threading.Thread(
            target=keep_lease, args=(settings, segment_id, lease_token, heartbeat_stop), daemon=True
        )
        heartbeat.start()
        is_prompt = inputs.get("workflow") == "agent"
        if inputs.get("model"):
            settings = settings.model_copy(update={"openrouter_model": inputs["model"]})
        model, search = prompt_adapters(settings) if is_prompt else adapters(settings)
        if inputs.get("_browser"):
            if not browser:
                raise ValueError("Browser job has no manager-issued endpoint")
            if settings.model_mode == "fake":
                model = FakeBrowserModel()
        config = {"configurable": {"thread_id": task["thread_id"]}, "recursion_limit": 150}
        command = segment["command"]

        def expired(_signum, _frame):
            raise TimeoutError("task active-runtime budget exhausted")

        previous_handler = signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, task["limits"]["max_active_seconds"])
        try:
            with (
                trace_scope(settings, task_id, segment_id, segment["input_revision"]),
                PostgresSaver.from_conn_string(settings.database_url) as checkpointer,
            ):
                checkpointer.setup()
                # Serialize graph writers across lease recovery as well as normal dispatch.
                checkpointer.conn.execute(
                    "SELECT pg_advisory_lock(hashtextextended(%s,0))", (task_id,)
                )

                def on_event(kind, payload):
                    # A separate short transaction makes progress visible while the graph is executing.
                    import psycopg

                    with psycopg.connect(settings.database_url) as connection:
                        current = connection.execute(
                            "SELECT t.status,s.state,s.lease_token FROM tasks t JOIN execution_segments s ON s.task_id=t.id WHERE s.id=%s",
                            (segment_id,),
                        ).fetchone()
                        if (
                            not current
                            or current[0] in {"paused", "cancelled"}
                            or current[1] != "leased"
                            or str(current[2]) != lease_token
                        ):
                            raise WorkerStopped("Task stopped at a safe execution boundary.")
                        if kind == "browser_boundary":
                            return
                        connection.execute(
                            "INSERT INTO application_events(task_id,event_type,payload) VALUES(%s,%s,%s::jsonb)",
                            (task_id, kind, canonical_json(payload)),
                        )

                graph = (
                    build_prompt_graph(
                        checkpointer, search, model, settings.search_mode, on_event, browser
                    )
                    if is_prompt
                    else build_graph(checkpointer, search, model)
                )
                if command.get("kind") == "start":
                    result = graph.invoke(
                        {
                            "task_id": task_id,
                            "input_revision": segment["input_revision"],
                            "inputs": inputs,
                            "stage": "understand",
                        },
                        config,
                    )
                else:
                    reconcile = command.get("kind") == "reconcile"
                    if reconcile:
                        graph.update_state(
                            config,
                            {"input_revision": segment["input_revision"], "inputs": inputs},
                        )
                    # A job paused mid-step (e.g. the browser paused) has no question to answer: just continue.
                    if command.get("resume", {}).get("control") in {"retry", "resume"} or (
                        reconcile and not graph.get_state(config).interrupts
                    ):
                        snapshot = graph.get_state(config)
                        # Continue the failed node; a control command is not a human interrupt answer.
                        result = graph.invoke(
                            None
                            if snapshot.values
                            else {
                                "task_id": task_id,
                                "input_revision": segment["input_revision"],
                                "inputs": inputs,
                                "stage": "understand",
                            },
                            config,
                        )
                    else:
                        result = graph.invoke(Command(resume=command.get("resume", {})), config)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)
        current_task = await db.get_task(task_id)
        if current_task["status"] in {"paused", "cancelled"}:
            raise WorkerStopped("Task stopped before publishing the segment result.")
        store = ArtifactStore(settings.workspace_root, db)
        await persist_drafts(
            store, task_id, segment["input_revision"], result, task["limits"]["max_artifact_bytes"]
        )
        for source in result.get("sources", []):
            await db.persist_source(task_id, segment["input_revision"], source)
        pending = interrupt_value(result)
        if pending:
            if pending.get("kind") == "scheduled_event":
                await db.schedule_reminder(task_id, segment["input_revision"], pending["payload"])
                await db.set_task_state(
                    task_id,
                    "waiting_event",
                    {"stage": "waiting_event", "preview": pending["preview"]},
                )
                await db.append_event(task_id, "graph_interrupted", {"kind": "scheduled_event"})
            else:
                interaction = await db.upsert_interaction(
                    task_id, segment["input_revision"], pending
                )
                status = "waiting_approval" if pending["kind"] == "approval" else "waiting_input"
                state = await db.set_task_state(
                    task_id,
                    status,
                    {"stage": status, "interaction_id": interaction["id"]},
                    plan=result.get("plan"),
                )
                await db.append_event(
                    task_id,
                    "graph_interrupted",
                    {
                        "interaction_id": interaction["id"],
                        "kind": pending["kind"],
                        "version": state["version"],
                    },
                )
        else:
            await db.set_task_state(
                task_id,
                "completed",
                {"stage": "completed"},
                outcome=result.get("outcome", {"completed": True}),
                plan=result.get("plan"),
            )
            if command.get("resume", {}).get("event") == "reminder_due":
                event_id = command["resume"]["event_id"]
                if await db.record_reminder_delivery(task_id, event_id):
                    await db.append_event(task_id, "reminder_due", {"event_id": event_id})
            await db.append_event(
                task_id, "task_completed", {"input_revision": segment["input_revision"]}
            )
        await db.complete_segment(segment_id, lease_token)
    except WorkerStopped:
        await db.complete_segment(segment_id, lease_token)
    except Exception as exc:
        latest = await db.get_task(task_id)
        if latest and latest["status"] in {"paused", "cancelled"}:
            await db.complete_segment(segment_id, lease_token)
            return
        await db.complete_segment(
            segment_id, lease_token, {"code": "worker_error", "message": str(exc)}
        )
        await db.set_task_state(
            task_id,
            "failed",
            {"stage": "failed"},
            error={"code": "worker_error", "message": str(exc)},
        )
        await db.append_event(task_id, "worker_failed", {"error": str(exc)})
        raise
    finally:
        if browser:
            browser.release()
        heartbeat_stop.set()
        if heartbeat:
            heartbeat.join(timeout=6)
        await db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--segment-id", required=True)
    parser.add_argument("--lease-token", required=True)
    args = parser.parse_args()
    asyncio.run(execute(args.task_id, args.segment_id, args.lease_token))


if __name__ == "__main__":
    main()
