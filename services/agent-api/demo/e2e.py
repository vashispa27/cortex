"""Synthetic end-to-end API walkthrough. Requires the API, Postgres, and Docker worker to be running."""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

BASE = os.getenv("CORTEX_AGENT_API_URL", "http://127.0.0.1:8790")
TOKEN = os.environ["CORTEX_AGENT_API_TOKEN"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def request(client: httpx.Client, method: str, path: str, **kwargs):
    response = client.request(
        method, f"{BASE}{path}", headers=HEADERS | kwargs.pop("headers", {}), **kwargs
    )
    response.raise_for_status()
    return response.json()


def wait_for(client: httpx.Client, task_id: str, expected: set[str], timeout: int = 45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        task = request(client, "GET", f"/v1/tasks/{task_id}")
        if task["status"] in expected:
            return task
        time.sleep(0.5)
    raise TimeoutError(f"task did not reach {expected}")


def approve(
    client: httpx.Client, task: dict, interaction: dict, key: str, decision="approve", feedback=None
):
    body = {"expected_version": task["version"], "decision": decision}
    if feedback:
        body["feedback"] = feedback
    return request(
        client,
        "POST",
        f"/v1/tasks/{task['task_id']}/interactions/{interaction['id']}/responses",
        json=body,
        headers={"Idempotency-Key": key},
    )


def main():
    fixture = __import__("json").loads(
        (Path(__file__).parents[1] / "fixtures/recruiter-task.json").read_text()
    )
    fixture["reminder_at"] = (datetime.now(UTC) + timedelta(seconds=8)).isoformat()
    with httpx.Client(timeout=15) as client:
        created = request(
            client,
            "POST",
            "/v1/tasks",
            json=fixture,
            headers={"Idempotency-Key": "synthetic-e2e-create-1"},
        )
        task_id = created["task_id"]
        task = wait_for(client, task_id, {"waiting_approval", "failed"})
        assert task["status"] == "waiting_approval", task
        interactions = request(client, "GET", f"/v1/tasks/{task_id}/interactions")
        approve(client, task, interactions[-1], "synthetic-e2e-plan-1")

        task = wait_for(client, task_id, {"waiting_approval", "failed"})
        final = request(client, "GET", f"/v1/tasks/{task_id}/interactions")[-1]
        approve(
            client, task, final, "synthetic-e2e-change-1", "request_changes", "Use a concise note."
        )

        task = wait_for(client, task_id, {"waiting_approval", "failed"})
        # Immutable input revision: this invalidates the pending final review and queues reconciliation.
        request(
            client,
            "PATCH",
            f"/v1/tasks/{task_id}/inputs",
            params={"expected_version": task["version"]},
            json={
                "master_resume": fixture["master_resume"]
                + "\n- Documented data-quality checks for reporting."
            },
            headers={"Idempotency-Key": "synthetic-e2e-input-revision-1"},
        )
        task = wait_for(client, task_id, {"waiting_approval", "failed"})
        revised_final = request(client, "GET", f"/v1/tasks/{task_id}/interactions")[-1]
        approve(client, task, revised_final, "synthetic-e2e-final-1")
        task = wait_for(client, task_id, {"waiting_event", "failed"})
        print("Waiting reminder:", task["task_id"], task["status"])
        done = wait_for(client, task_id, {"completed", "failed"})
        print("Final status:", done["status"])
        print("Artifacts:", request(client, "GET", f"/v1/tasks/{task_id}/artifacts"))
        print("Events:", request(client, "GET", f"/v1/tasks/{task_id}/events"))


if __name__ == "__main__":
    main()
