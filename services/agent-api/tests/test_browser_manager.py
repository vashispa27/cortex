"""Real Postgres journal/approval tests; no model or browser required."""

import os
import uuid

import pytest

from cortex_agent_api.migrate import migrate
from cortex_agent_api.schemas import CreateTaskRequest
from cortex_agent_api.settings import Settings

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_AGENT_INTEGRATION") != "1",
        reason="Set RUN_AGENT_INTEGRATION=1 with local compose Postgres",
    ),
]


async def test_a_chat_follow_up_joins_a_paused_job_and_continues_it(
    isolated_agent_database, tmp_path
):
    import httpx

    from cortex_agent_api.main import create_app

    settings = Settings(
        _env_file=None,
        CORTEX_AGENT_DATA_DIR=tmp_path,
        CORTEX_AGENT_API_TOKEN="browser-fixture-manager-only-token",
    )
    await migrate(settings.database_url)
    app = create_app(settings)  # No lifespan: no dispatcher starts a worker for the queued job.
    db = app.state.db
    await db.open()
    try:
        task_id = str(uuid.uuid4())
        inputs = CreateTaskRequest(workflow="agent", task="Book a flight").model_dump(mode="json")
        await db.create_task(task_id, inputs, str(tmp_path / task_id))
        # As after the browser paused it: the worker's segment ended and the job is paused.
        await db.execute(
            "UPDATE execution_segments SET state='cancelled' WHERE task_id=$1", uuid.UUID(task_id)
        )
        await db.execute(
            "UPDATE tasks SET status='paused',version=version+1 WHERE id=$1", uuid.UUID(task_id)
        )
        version = (await db.get_task(task_id))["version"]
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer browser-fixture-manager-only-token"},
        ) as client:
            path = f"/v1/tasks/{task_id}/messages"
            stale = await client.post(path, json={"expected_version": version - 1, "text": "x"})
            assert stale.status_code == 409
            response = await client.post(
                path, json={"expected_version": version, "text": "24 November, 1 adult, economy"}
            )
            assert response.status_code == 202, response.text
        task = await db.get_task(task_id)
        assert task["status"] == "queued"
        assert (await db.task_inputs(task_id))["payload"]["task"] == (
            "Book a flight\n\nThe user added: 24 November, 1 adult, economy"
        )
        segment = await db.claim_segment(120)
        assert segment["command"]["kind"] == "reconcile"
    finally:
        await db.close()
