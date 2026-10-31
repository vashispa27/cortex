"""Interactive terminal client using the same durable API and Docker workers as HTTP clients."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import httpx

from .settings import Settings


def display(value=""):
    # Retrieved pages and model output must not inject terminal control sequences.
    text = str(value)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    print("".join(c for c in text if c in "\n\t" or (ord(c) >= 32 and ord(c) != 127)), flush=True)


class ApiError(RuntimeError):
    pass


class Client:
    def __init__(self, url: str, token: str):
        self.http = httpx.Client(
            base_url=url.rstrip("/"), headers={"Authorization": f"Bearer {token}"}, timeout=30
        )

    def request(self, method, path, payload=None):
        headers = {"Idempotency-Key": str(uuid.uuid4())} if method != "GET" else {}
        result = self.http.request(method, path, json=payload, headers=headers)
        if not result.is_success:
            raise ApiError(f"API {result.status_code}: {result.text[:1_000]}")
        return result.json()

    def task(self, task_id):
        return self.request("GET", f"/v1/tasks/{task_id}")

    def respond(self, task, response):
        pending = task["pending_interaction"]
        return self.request(
            "POST",
            f"/v1/tasks/{task['task_id']}/interactions/{pending['id']}/responses",
            {"expected_version": task["version"], **response},
        )

    def close(self):
        self.http.close()


def read_document(path: str) -> dict:
    target = Path(path).expanduser()
    if target.stat().st_size > 200_000:
        raise ValueError("Attachments must be UTF-8 text and at most 200,000 bytes.")
    return {
        "name": target.name,
        "content": target.read_text(encoding="utf-8"),
        "media_type": "text/plain",
    }


def source_hash(root: Path):
    digest = hashlib.sha256()
    files = [
        root / "Dockerfile",
        root / "pyproject.toml",
        root / "uv.lock",
        *sorted((root / "src").rglob("*.py")),
        *sorted((root / "src").rglob("*.json")),
    ]
    for path in files:
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def ensure_image(settings: Settings, log):
    root = Path(__file__).resolve().parents[2]
    desired = source_hash(root)
    result = subprocess.run(
        [
            "docker",
            "image",
            "inspect",
            settings.docker_image,
            "--format",
            '{{index .Config.Labels "cortex.agent.sourcehash"}}',
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip() == desired:
        return
    display("Building the task worker image (first run or source changed)…")
    result = subprocess.run(
        [
            "docker",
            "build",
            "--label",
            f"cortex.agent.sourcehash={desired}",
            "-t",
            settings.docker_image,
            str(root),
        ],
        stdout=log,
        stderr=log,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("Worker image build failed; inspect .data/cli-manager.log.")


@contextmanager
def local_backend(args):
    settings = Settings()
    if args.api_url:
        client = Client(args.api_url, settings.api_token)
        try:
            yield client
        finally:
            client.close()
        return
    if not args.demo and (not settings.openrouter_api_key or not settings.openrouter_model):
        raise ValueError(
            "Export OPENROUTER_API_KEY and OPENROUTER_MODEL, or use --demo for an explicit fixture run."
        )
    env = dict(os.environ)
    env["CORTEX_AGENT_MODEL_MODE"] = "fake" if args.demo else "openrouter"
    env["CORTEX_AGENT_SEARCH_MODE"] = (
        "fake" if args.demo else "tavily" if settings.tavily_api_key else "disabled"
    )
    env["CORTEX_AGENT_API_TOKEN"] = settings.api_token if args.resume else secrets.token_urlsafe(32)
    if settings.openrouter_api_key:
        env["OPENROUTER_API_KEY"] = settings.openrouter_api_key
    if settings.openrouter_model:
        env["OPENROUTER_MODEL"] = settings.openrouter_model
    url = f"http://127.0.0.1:{args.port}"
    try:
        httpx.get(url + "/health", timeout=0.5)
    except httpx.TransportError:
        pass
    else:
        raise ValueError(
            f"Port {args.port} is already in use. Use --api-url {url} to attach or choose --port."
        )
    log_path = settings.data_dir.resolve() / "cli-manager.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch(mode=0o600, exist_ok=True)
    with log_path.open("a") as log:
        ensure_image(settings, log)
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "cortex_agent_api.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.port),
            ],
            env=env,
            stdout=log,
            stderr=log,
        )
        client = Client(url, env["CORTEX_AGENT_API_TOKEN"])
        try:
            for _ in range(150):
                if process.poll() is not None:
                    raise RuntimeError(f"Local API could not start. Inspect {log_path}.")
                try:
                    result = client.http.get("/health", timeout=0.5)
                    if result.is_success:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.2)
            else:
                raise RuntimeError(f"Local API startup timed out. Inspect {log_path}.")
            display(f"Model: {'synthetic demo' if args.demo else settings.openrouter_model}")
            display(f"Search: {env['CORTEX_AGENT_SEARCH_MODE']} · API: {url}")
            yield client
        finally:
            client.close()
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


class Session:
    def __init__(self, client: Client, timezone: str, documents=None, max_model_calls=16):
        self.client = client
        self.timezone = timezone
        self.documents = documents or []
        self.task_id = None
        self.max_model_calls = max_model_calls

    def create(self, prompt):
        task = self.client.request(
            "POST",
            "/v1/tasks",
            {
                "workflow": "agent",
                "task": prompt,
                "timezone": self.timezone,
                "supporting_documents": self.documents,
                "limits": {"max_model_calls": self.max_model_calls},
            },
        )
        self.task_id = task["task_id"]
        display(f"Task: {self.task_id}\nReconnect later with: cortex-agent --resume {self.task_id}")
        self.watch()

    def events(self, after):
        rows = self.client.request(
            "GET", f"/v1/tasks/{self.task_id}/events?after_id={after}&limit=100"
        )
        for event in rows:
            after = event["id"]
            kind, data = event["event_type"], event["payload"]
            if kind == "agent_step":
                display(f"  Agent: {data['action']}")
            elif kind in {"tool_started", "tool_completed"}:
                display(f"  {kind.replace('_', ' ')}: {data['tool']}")
        return after

    def show_artifacts(self, task=None):
        task = task or self.client.task(self.task_id)
        artifacts = task.get("artifacts", [])
        if not artifacts:
            display("No artifacts yet.")
        for artifact in artifacts:
            display(
                f"  {artifact['logical_name']} · {artifact['id']} · revision {artifact['input_revision']}"
            )
        return artifacts

    def download(self, artifact_id):
        artifacts = self.show_artifacts()
        artifact = next((a for a in artifacts if a["id"] == artifact_id), None)
        if not artifact:
            raise ValueError("Choose an artifact ID shown above.")
        result = self.client.http.get(f"/v1/tasks/{self.task_id}/artifacts/{artifact_id}")
        result.raise_for_status()
        directory = Path("agent-downloads") / self.task_id
        directory.mkdir(parents=True, exist_ok=True)
        name = Path(artifact["logical_name"]).name
        target = directory / f"{artifact_id}-{name}"
        target.write_bytes(result.content)
        display(f"Saved {target.resolve()}")

    def watch(self):
        cursor = 0
        previous = None
        try:
            while True:
                task = self.client.task(self.task_id)
                cursor = self.events(cursor)
                status = task["status"]
                if status != previous:
                    display(f"[{status}]")
                    previous = status
                if status in {"completed", "cancelled", "failed"}:
                    if (task.get("outcome") or {}).get("response"):
                        display("\n" + task["outcome"]["response"])
                    if task.get("error"):
                        display(json.dumps(task["error"], indent=2))
                    self.show_artifacts(task)
                    if status == "completed":
                        rejected = (task.get("outcome") or {}).get("rejected")
                        if (task.get("outcome") or {}).get("incomplete"):
                            display(
                                "Stopped with partial progress; the requested work is incomplete."
                            )
                        else:
                            display(
                                f"Task ended: {rejected} rejected."
                                if rejected
                                else "Task finished."
                            )
                    return
                pending = task.get("pending_interaction")
                if pending and status in {"waiting_input", "waiting_approval"}:
                    preview = pending["preview"]
                    display("\n" + preview.get("markdown", json.dumps(preview, indent=2)))
                    if preview.get("reminder_at"):
                        display(f"Reminder: {preview['reminder_at']}")
                    if pending["kind"] == "clarification":
                        answer = input("Your answer (/detach to leave): ").strip()
                        if answer == "/detach":
                            return
                        if not answer:
                            continue
                        fields = pending["payload"].get("fields", [])
                        field = fields[0]["field"] if fields else "response"
                        response = {"answer": {field: answer}}
                    else:
                        choice = input(
                            "Review [y=approve / n=reject / type feedback / /detach]: "
                        ).strip()
                        if choice == "/detach":
                            return
                        if not choice:
                            continue
                        response = (
                            {"decision": "approve"}
                            if choice.lower() in {"y", "yes", "approve"}
                            else {"decision": "reject"}
                            if choice.lower() in {"n", "no", "reject"}
                            else {"decision": "request_changes", "feedback": choice}
                        )
                    try:
                        self.client.respond(task, response)
                    except ApiError as exc:
                        display(exc)
                        # A concurrent API edit makes this version stale. Refresh before asking again.
                    time.sleep(0.3)
                elif status in {"paused", "waiting_event"}:
                    display("Task remains saved. /watch reconnects; /quit leaves the CLI.")
                    return
                else:
                    time.sleep(0.5)
        except KeyboardInterrupt:
            display("\nDetached from task; /watch reconnects, /cancel cancels it.")

    def loop(self, prompt=None):
        display("Cortex agent · /help for commands · Ctrl+C detaches · /quit exits")
        if self.task_id:
            self.watch()
        elif prompt:
            self.create(prompt)
        while True:
            try:
                line = input("\nYou › ").strip()
                if not line:
                    continue
                if line in {"/quit", "/exit"}:
                    return
                if line == "/help":
                    display(
                        "Type a prompt to start a task. /attach PATH adds a UTF-8 document to the next task.\n/tasks lists tasks; /resume ID reconnects; /watch watches the current task; /status shows it;\n/artifacts lists files; /download ID saves one; /cancel cancels; /retry retries a failure;\n/paste reads multiple lines until a line containing only . ; /quit exits."
                    )
                elif line.startswith("/attach "):
                    document = read_document(line[8:].strip())
                    self.documents.append(document)
                    display(f"Attached: {document['name']}")
                elif line == "/tasks":
                    for task in self.client.request("GET", "/v1/tasks"):
                        display(f"{task['task_id']}  {task['status']}  {task['objective'][:100]}")
                elif line.startswith("/resume "):
                    self.task_id = str(uuid.UUID(line[8:].strip()))
                    self.watch()
                elif line in {
                    "/status",
                    "/watch",
                    "/artifacts",
                    "/cancel",
                    "/retry",
                } or line.startswith("/download "):
                    if not self.task_id:
                        display("Submit a prompt or /resume TASK_ID first.")
                        continue
                    if line == "/watch":
                        self.watch()
                    elif line == "/artifacts":
                        self.show_artifacts()
                    elif line.startswith("/download "):
                        self.download(line[10:].strip())
                    else:
                        task = self.client.task(self.task_id)
                        if line == "/status":
                            display(json.dumps(task, indent=2))
                        else:
                            self.client.request(
                                "POST",
                                f"/v1/tasks/{self.task_id}{line}",
                                {"expected_version": task["version"]},
                            )
                            self.watch()
                elif line == "/paste":
                    display("Paste your prompt; finish with a line containing only .")
                    lines = []
                    while (part := input()) != ".":
                        lines.append(part)
                    if lines:
                        self.create("\n".join(lines))
                elif line.startswith("/"):
                    display("Unknown command. Type /help.")
                else:
                    self.create(line)
            except (ApiError, httpx.HTTPError, ValueError, OSError) as exc:
                display(exc)
            except KeyboardInterrupt:
                display("\nUse /quit to exit.")


def main():
    parser = argparse.ArgumentParser(
        description="Interactive Cortex agent: prompts, questions, reviews, and artifacts."
    )
    parser.add_argument(
        "prompt", nargs="?", help="Optional initial prompt; otherwise enter prompts interactively."
    )
    parser.add_argument("--resume", metavar="TASK_ID")
    parser.add_argument(
        "--file", action="append", default=[], help="Attach a UTF-8 document (repeatable)."
    )
    parser.add_argument("--timezone", default="Asia/Kolkata")
    parser.add_argument(
        "--max-model-calls",
        type=int,
        choices=range(1, 41),
        default=16,
        metavar="1-40",
        help="Initial model-call budget for new tasks (default: 16); extensions require review.",
    )
    parser.add_argument(
        "--api-url", help="Attach to an already configured API instead of starting a local manager."
    )
    parser.add_argument(
        "--port", type=int, default=8791, help="Port for the CLI's local API (default: 8791)."
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Explicit synthetic model/search fixtures; no provider calls.",
    )
    args = parser.parse_args()
    try:
        documents = [read_document(path) for path in args.file]
        with local_backend(args) as client:
            session = Session(client, args.timezone, documents, args.max_model_calls)
            session.task_id = str(uuid.UUID(args.resume)) if args.resume else None
            session.loop(args.prompt)
    except (EOFError, KeyboardInterrupt):
        display("\nSession closed. Tasks and pending reviews remain in Postgres.")
    except (ApiError, httpx.HTTPError, ValueError, OSError, RuntimeError) as exc:
        display(exc)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
