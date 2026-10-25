import asyncio
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.tools import registered_tools


async def test_sync_and_async_tools_work_inside_a_running_event_loop(monkeypatch):
    async def fetch(url, max_bytes):
        await asyncio.sleep(0)
        assert max_bytes == 1_024
        return url, "A bounded page"

    monkeypatch.setattr("cortex_agent_api.tools.fetch_public_page", fetch)
    tools = {t.name: t for t in registered_tools(FakeSearchAdapter(), {}, 1_024)}
    # This is the worker's actual calling shape: sync tool invocation within async execution.
    assert tools["search_web"].invoke({"query": "company"})[0]["synthetic"]
    assert (
        tools["fetch_bounded_public_page"].invoke({"url": "https://example.com"})["content"]
        == "A bounded page"
    )
    assert (await tools["search_web"].ainvoke({"query": "company"}))[0]["synthetic"]
    assert (await tools["fetch_bounded_public_page"].ainvoke({"url": "https://example.com"}))[
        "content"
    ] == "A bounded page"


async def test_async_bridge_propagates_tool_errors_without_an_unawaited_coroutine(monkeypatch):
    async def fetch(url, max_bytes):
        raise ValueError("public URL rejected")

    monkeypatch.setattr("cortex_agent_api.tools.fetch_public_page", fetch)
    tool = registered_tools(FakeSearchAdapter(), {}, 1_024)[1]
    with pytest.raises(ValueError, match="public URL rejected"):
        tool.invoke({"url": "http://localhost"})


WORKER_FLOW = """
import asyncio, uuid
from pathlib import Path
import cortex_agent_api.worker as worker
from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.agent_graph import Decision
from cortex_agent_api.database import Database
from cortex_agent_api.schemas import CreateTaskRequest
from cortex_agent_api.settings import Settings

class ScriptedModel:
    def __init__(self):
        self.steps = iter([
            Decision(action="plan", text="Search the synthetic fixture and fetch the example public page."),
            Decision(action="tool", text="Check a synthetic search result", tool="search_web", query="synthetic company"),
            Decision(action="tool", text="Fetch a real public page", tool="fetch_bounded_public_page", url="https://example.com/"),
            Decision(action="finish", text="# Result\\nPublic example page fetched: https://example.com/"),
        ])
    def decide(self, context):
        return next(self.steps)

async def main():
    settings = Settings()
    db = Database(settings.database_url)
    await db.open()
    task_id = str(uuid.uuid4())
    inputs = CreateTaskRequest(workflow="agent", task="Synthetic async tool regression").model_dump(mode="json")
    inputs["limits"]["max_model_calls"] = 1
    inputs["_execution_profile"] = settings.execution_profile
    await db.create_task(task_id, inputs, "/workspace/tasks/" + task_id)
    model = ScriptedModel()
    worker.prompt_adapters = lambda settings: (model, FakeSearchAdapter())

    async def segment():
        job = await db.claim_segment(90, settings.execution_profile)
        assert job
        await worker.execute(task_id, str(job["id"]), str(job["lease_token"]))

    async def approve():
        task = await db.get_task(task_id)
        assert task["status"] == "waiting_approval", task
        pending = [x for x in await db.interactions(task_id) if x["state"] == "pending"][0]
        await db.resolve_interaction(task_id, pending["id"], task["version"], {"decision": "approve"})

    await segment()
    await approve()
    await segment()
    budget = [x for x in await db.interactions(task_id) if x["state"] == "pending"][0]
    assert budget["operation"] == "extend_model_budget"
    await approve()
    await segment()
    task = await db.get_task(task_id)
    assert task["status"] == "waiting_approval", task
    sources = await db.fetch("SELECT evidence FROM sources WHERE task_id=$1", uuid.UUID(task_id))
    assert any("Example Domain" in x["evidence"] for x in sources), sources
    artifacts = await db.fetch("SELECT relative_path FROM artifacts WHERE task_id=$1", uuid.UUID(task_id))
    assert artifacts and (Path("/workspace/tasks") / task_id / artifacts[0]["relative_path"]).is_file()
    await approve()
    await segment()
    assert (await db.get_task(task_id))["status"] == "completed"
    await db.close()
    print("ASYNC_WORKER_FLOW_OK")

asyncio.run(main())
"""


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_AGENT_INTEGRATION") != "1",
    reason="Requires Postgres, Docker, and public HTTPS connectivity",
)
def test_real_worker_search_fetch_review_and_completion(isolated_agent_database):
    from cortex_agent_api.cli import ensure_image
    from cortex_agent_api.dispatcher import LocalDockerBackend
    from cortex_agent_api.migrate import migrate
    from cortex_agent_api.settings import Settings

    settings = Settings()
    asyncio.run(migrate(settings.database_url))
    root = Path(__file__).resolve().parents[1] / ".data"
    root.mkdir(exist_ok=True)
    with (root / "async-tool-build.log").open("a") as log:
        ensure_image(settings, log)
    with tempfile.TemporaryDirectory(prefix="async-tools-", dir=root) as workspace:
        result = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-i",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,size=32m",
                "--memory",
                "512m",
                "--cpus",
                "1",
                "--pids-limit",
                "64",
                "--mount",
                f"type=bind,src={workspace},dst=/workspace",
                "--env",
                f"DATABASE_URL={LocalDockerBackend(settings).docker_database_url()}",
                "--env",
                "CORTEX_AGENT_DATA_DIR=/workspace",
                "--entrypoint",
                "python",
                settings.docker_image,
                "-",
            ],
            input=WORKER_FLOW,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "ASYNC_WORKER_FLOW_OK" in result.stdout
