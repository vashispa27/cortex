import builtins
import json

import httpx

from cortex_agent_api.cli import Client, Session, display


def test_terminal_review_uses_current_interaction_and_version(monkeypatch):
    posted = []
    responses = iter(
        [
            {
                "task_id": "task",
                "status": "waiting_approval",
                "version": 7,
                "pending_interaction": {
                    "id": "plan",
                    "kind": "approval",
                    "preview": {"markdown": "Please review this plan"},
                },
            },
            {"task_id": "task", "status": "completed", "artifacts": []},
        ]
    )

    def handler(request):
        if request.url.path.endswith("/events"):
            return httpx.Response(200, json=[])
        if request.method == "POST":
            posted.append((request.url.path, json.loads(request.content)))
            return httpx.Response(202, json={})
        return httpx.Response(200, json=next(responses))

    client = Client("http://localhost", "token")
    client.http.close()
    client.http = httpx.Client(base_url="http://localhost", transport=httpx.MockTransport(handler))
    monkeypatch.setattr(builtins, "input", lambda _: "y")
    monkeypatch.setattr("cortex_agent_api.cli.time.sleep", lambda _: None)
    session = Session(client, "UTC")
    session.task_id = "task"
    session.watch()
    assert posted == [
        (
            "/v1/tasks/task/interactions/plan/responses",
            {"expected_version": 7, "decision": "approve"},
        )
    ]
    client.close()


def test_terminal_does_not_render_model_escape_sequences(capsys):
    display("hello\x1b[2J\x07world")
    assert capsys.readouterr().out == "helloworld\n"
