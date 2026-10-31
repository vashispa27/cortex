"""Browser Use drives a real Chromium tab through the unpacked extension and the service's relay.
The model is scripted (no API calls): it asks the user a question through the job API, types the
answer into the page, and finishes."""

import asyncio
import os
import re
import shutil
import uuid
from pathlib import Path

import httpx
import pytest
from conftest import ROOT, serve

from cortex_agent_api.main import create_app
from cortex_agent_api.settings import Settings
from fixtures import fixture_app


class ScriptedModel:
    """Stands in for the LLM: reads the page Browser Use shows it and returns the next action."""

    model = "scripted"
    provider = "scripted"
    name = "scripted"
    _verified_api_keys = True

    def __init__(self):
        self.steps = 0
        self.answer = None

    @property
    def model_name(self):
        return self.model

    async def ainvoke(self, messages, output_format=None, **kwargs):
        from browser_use.llm.views import ChatInvokeCompletion

        text = "\n".join(
            str(getattr(m, "text", None) or getattr(m, "content", "")) for m in messages
        )
        self.steps += 1
        if os.getenv("TRACE_DIR"):
            Path(os.environ["TRACE_DIR"], f"step{self.steps}.txt").write_text(text)
        if self.answer is None and (found := re.search(r"User: ([^\s\"']+)", text)):
            self.answer = found.group(1).strip()
        if self.answer is None:
            action = {"ask_user": {"question": "Which email should I use?"}}
        elif (
            self.steps < 6
            and (field := re.search(r"\[(\d+)\]<input[^>]*email", text))
            and "typed" not in text
        ):
            action = {"input": {"index": int(field.group(1)), "text": self.answer, "clear": True}}
        else:
            action = {"done": {"text": f"Entered {self.answer}", "success": True}}
        output = output_format.model_validate(
            {
                "thinking": "scripted",
                "evaluation_previous_goal": "ok",
                "memory": "typed" if "input" in action else "",
                "next_goal": next(iter(action)),
                "action": [action],
            }
        )
        return ChatInvokeCompletion(completion=output, usage=None)


@pytest.mark.skipif(
    os.getenv("RUN_BROWSER_E2E") != "1",
    reason="Set RUN_BROWSER_E2E=1 with Chromium and Postgres",
)
async def test_browser_use_drives_the_users_tab_and_asks_through_the_job_api(
    isolated_agent_database,
):
    from playwright.async_api import async_playwright

    folder = ROOT / "services/agent-api/.data" / ("browser-use-" + uuid.uuid4().hex)
    folder.mkdir(parents=True)
    settings = Settings(
        _env_file=None,
        CORTEX_AGENT_DATA_DIR=folder,
        CORTEX_AGENT_API_TOKEN="browser-fixture-manager-only-token",
    )
    app = create_app(settings)
    model = ScriptedModel()
    live = os.getenv("CORTEX_BROWSER_LIVE") == "1"  # Opt-in: a real OpenRouter model, a few cents.
    if not live:
        app.state.browser_agents.llm = lambda payload: model
    fixture = fixture_app()
    try:
        async with serve(app) as port, serve(fixture) as fixture_port, async_playwright() as pw:
            app.state.browser_agents.port = port
            options = (
                {"executable_path": path} if (path := os.getenv("CORTEX_TEST_CHROMIUM")) else {}
            )
            context = await pw.chromium.launch_persistent_context(
                str(folder / "profile"),
                headless=False,
                ignore_default_args=["--disable-extensions"],
                args=[
                    f"--disable-extensions-except={ROOT / 'apps/chrome-extension'}",
                    f"--load-extension={ROOT / 'apps/chrome-extension'}",
                ],
                **options,
            )
            try:
                worker = (
                    context.service_workers[0]
                    if context.service_workers
                    else await context.wait_for_event("serviceworker")
                )
                page = await context.new_page()
                await page.goto(f"http://127.0.0.1:{fixture_port}/form")
                popup = await context.new_page()
                await popup.goto(f"chrome-extension://{worker.url.split('/')[2]}/popup.html")
                await popup.evaluate(
                    "async (port) => { await chrome.storage.local.set({managerPort:port}); await chrome.runtime.sendMessage({action:'connect'}); }",
                    port,
                )
                await popup.close()
                await page.bring_to_front()
                async with httpx.AsyncClient(
                    base_url=f"http://127.0.0.1:{port}",
                    headers={"Authorization": "Bearer " + settings.api_token},
                    timeout=30,
                ) as client:
                    for _ in range(200):
                        current = (await client.get("/v1/browser/status")).json().get("current_tab")
                        if current and current["url"] == page.url:
                            break
                        await asyncio.sleep(0.05)
                    response = await client.post(
                        "/v1/tasks",
                        headers={"Idempotency-Key": uuid.uuid4().hex},
                        json={
                            "workflow": "agent",
                            "use_browser_tab": True,
                            "task": "Fill in my email.",
                        },
                    )
                    assert response.status_code == 202, response.text
                    task_id = response.json()["task_id"]
                    answered = False
                    for _ in range(600):
                        job = (await client.get(f"/v1/tasks/{task_id}")).json()
                        if job["status"] in {"failed", "cancelled", "completed"}:
                            break
                        pending = job.get("pending_interaction")
                        if pending and not answered:
                            assert live or pending["preview"]["markdown"] == "Which email should I use?"
                            reply = await client.post(
                                f"/v1/tasks/{task_id}/interactions/{pending['id']}/responses",
                                headers={"Idempotency-Key": uuid.uuid4().hex},
                                json={
                                    "expected_version": job["version"],
                                    "answer": {"response": "fixture@example.test"},
                                },
                            )
                            assert reply.status_code == 202, reply.text
                            answered = True
                        await asyncio.sleep(0.1)
                    assert job["status"] == "completed", job
                    assert answered
                    assert await page.locator("#email").input_value() == "fixture@example.test"
                    assert live or job["outcome"]["response"] == "Entered fixture@example.test"
                    assert fixture.state.submissions == []
            finally:
                await context.close()
    finally:
        shutil.rmtree(folder, ignore_errors=True)
