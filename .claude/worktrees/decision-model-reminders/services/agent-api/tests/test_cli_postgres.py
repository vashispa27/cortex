"""Exercise the terminal client against the real API, Postgres, and Docker task workers."""

import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

import pytest


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_AGENT_INTEGRATION") != "1", reason="Requires local Postgres and Docker"
)
def test_terminal_plan_revision_result_and_saved_task(isolated_agent_database):
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "cortex_agent_api.cli",
            "--demo",
            "--port",
            "8793",
            "Explain a database index in a short paragraph.",
        ],
        input="y\nMake it concise\ny\n/quit\n",
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
        cwd=root,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "[failed]" not in result.stdout, result.stdout
    assert result.stdout.count("Review [") == 3, result.stdout
    assert "result.md" in result.stdout
    assert "Task finished." in result.stdout


@pytest.mark.integration
@pytest.mark.skipif(
    os.getenv("RUN_AGENT_INTEGRATION") != "1", reason="Requires local Postgres and Docker"
)
def test_terminal_reconnect_after_manager_exit_preserves_pending_review(isolated_agent_database):
    root = Path(__file__).resolve().parents[1]
    command = [sys.executable, "-m", "cortex_agent_api.cli", "--demo", "--port", "8793"]
    first = subprocess.run(
        [*command, "Write a brief synthetic note"],
        input="/detach\n/quit\n",
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
        cwd=root,
    )
    assert first.returncode == 0, first.stdout + first.stderr
    assert "[waiting_approval]" in first.stdout
    task_id = re.search(r"Task: ([a-f0-9-]+)", first.stdout).group(1)
    resumed = subprocess.run(
        [*command, "--resume", task_id],
        input="y\ny\n/quit\n",
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
        cwd=root,
    )
    assert resumed.returncode == 0, resumed.stdout + resumed.stderr
    assert "[failed]" not in resumed.stdout, resumed.stdout
    assert "Task finished." in resumed.stdout


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_AGENT_INTEGRATION") != "1", reason="Requires local Postgres")
async def test_dispatcher_only_claims_its_model_profile(isolated_agent_database):
    from cortex_agent_api.database import Database
    from cortex_agent_api.migrate import migrate
    from cortex_agent_api.schemas import CreateTaskRequest
    from cortex_agent_api.settings import Settings

    settings = Settings()
    await migrate(settings.database_url)
    db = Database(settings.database_url)
    await db.open()
    try:
        identifiers = {}
        for profile in ("demo", "live"):
            task_id = str(uuid.uuid4())
            identifiers[profile] = task_id
            payload = CreateTaskRequest(
                workflow="agent", task="Profile isolation check"
            ).model_dump(mode="json")
            payload["_execution_profile"] = profile
            await db.create_task(task_id, payload, "unused-test-workspace")
        first = await db.claim_segment(90, "demo")
        assert str(first["task_id"]) == identifiers["demo"]
        assert await db.claim_segment(90, "demo") is None
        second = await db.claim_segment(90, "live")
        assert str(second["task_id"]) == identifiers["live"]
    finally:
        await db.close()
