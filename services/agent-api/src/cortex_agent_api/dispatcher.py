from __future__ import annotations

import asyncio
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from .database import ConflictError, Database
from .settings import Settings


class DockerUnavailable(RuntimeError):
    pass


@dataclass
class LocalDockerBackend:
    settings: Settings

    def _run(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(args, check=False, capture_output=True, text=True, timeout=20)
        except FileNotFoundError as exc:
            raise DockerUnavailable(
                "Docker is required. Install and start Docker Desktop, then retry."
            ) from exc

    def assert_available(self) -> None:
        result = self._run(["docker", "info", "--format", "{{.ServerVersion}}"])
        if result.returncode:
            raise DockerUnavailable(
                "Docker is unavailable. Start Docker Desktop and run `docker info` successfully."
            )

    def docker_database_url(self) -> str:
        parsed = urlparse(self.settings.database_url)
        host = parsed.hostname
        if host in {"127.0.0.1", "localhost"}:
            netloc = parsed.netloc.replace(host, "host.docker.internal", 1)
            return urlunparse(parsed._replace(netloc=netloc))
        return self.settings.database_url

    def launch(
        self,
        task_id: str,
        segment_id: str,
        lease_token: str,
        workspace: Path,
        browser_environment=None,
    ) -> str:
        self.assert_available()
        name = f"cortex-agent-{task_id[:8]}-{segment_id[:8]}"
        command = [
            "docker",
            "run",
            "--detach",
            "--rm",
            "--name",
            name,
            "--label",
            "cortex.agent=true",
            "--label",
            f"cortex.task={task_id}",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=64m",
            "--pids-limit",
            str(self.settings.task_pids_limit),
            "--cpus",
            str(self.settings.task_cpu),
            "--memory",
            f"{self.settings.task_memory_mb}m",
            "--network",
            self.settings.docker_network or "bridge",
            "--mount",
            f"type=bind,src={workspace.resolve()},dst=/workspace/tasks/{task_id}",
            "--env",
            f"DATABASE_URL={self.docker_database_url()}",
            "--env",
            "CORTEX_AGENT_DATA_DIR=/workspace",
            "--env",
            f"CORTEX_AGENT_MODEL_MODE={self.settings.model_mode}",
            "--env",
            f"CORTEX_AGENT_SEARCH_MODE={self.settings.search_mode}",
            "--env",
            f"CORTEX_AGENT_TRACE_MODE={self.settings.trace_mode}",
        ]
        for key, value in (browser_environment or {}).items():
            command += ["--env", f"{key}={value}"]
        if self.settings.openai_api_key:
            command += ["--env", f"CORTEX_AGENT_OPENAI_API_KEY={self.settings.openai_api_key}"]
        if self.settings.tavily_api_key:
            command += ["--env", f"CORTEX_AGENT_TAVILY_API_KEY={self.settings.tavily_api_key}"]
        command += ["--env", f"CORTEX_AGENT_OPENAI_MODEL={self.settings.openai_model}"]
        if self.settings.openrouter_api_key:
            command += ["--env", f"OPENROUTER_API_KEY={self.settings.openrouter_api_key}"]
        if self.settings.openrouter_model:
            command += ["--env", f"OPENROUTER_MODEL={self.settings.openrouter_model}"]
        if self.settings.trace_mode != "off" and (langsmith_key := os.getenv("LANGSMITH_API_KEY")):
            command += ["--env", f"LANGSMITH_API_KEY={langsmith_key}"]
            if project := os.getenv("LANGSMITH_PROJECT"):
                command += ["--env", f"LANGSMITH_PROJECT={project}"]
        command += [
            self.settings.docker_image,
            "--task-id",
            task_id,
            "--segment-id",
            segment_id,
            "--lease-token",
            lease_token,
        ]
        result = self._run(command)
        if result.returncode:
            raise DockerUnavailable(
                f"Docker could not start the task worker: {result.stderr.strip()}"
            )
        return result.stdout.strip()

    def stop_expired(self, container_id: str) -> None:
        # Only terminate a specific expired segment's recorded container, never another manager's workers.
        if len(container_id) == 64 and all(c in "0123456789abcdef" for c in container_id):
            self._run(["docker", "rm", "--force", container_id])


class Dispatcher:
    def __init__(self, database: Database, settings: Settings, browser=None) -> None:
        self.browser = browser
        self.database = database
        self.settings = settings
        self.docker = LocalDockerBackend(settings)
        self._stop = asyncio.Event()

    async def startup_recovery(self) -> None:
        await self.recover()

    async def recover(self) -> None:
        expired = await self.database.fetch(
            "SELECT container_id FROM execution_segments WHERE state='leased' AND lease_expires_at < now() AND container_id IS NOT NULL"
        )
        for segment in expired:
            await asyncio.to_thread(self.docker.stop_expired, segment["container_id"])
        await self.database.recover_expired_leases()

    async def run(self) -> None:
        while not self._stop.is_set():
            await self.recover()
            await self._dispatch_one()
            await self._schedule_one()
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=self.settings.dispatcher_poll_seconds
                )
            except TimeoutError:
                pass

    def stop(self) -> None:
        self._stop.set()

    async def _dispatch_one(self) -> None:
        segment = await self.database.claim_segment(
            self.settings.lease_seconds, self.settings.execution_profile
        )
        if not segment:
            return
        task_id, segment_id, token = (
            str(segment["task_id"]),
            str(segment["id"]),
            str(segment["lease_token"]),
        )
        task = await self.database.get_task(task_id)
        if not task or task["status"] == "cancelled":
            await self.database.complete_segment(segment_id, token)
            return
        try:
            workspace = self.settings.workspace_root / task_id
            workspace.mkdir(parents=True, exist_ok=True)
            browser_environment = (
                await self.browser.issue(task_id, segment_id, token) if self.browser else None
            )
            if browser_environment:
                container_id = await asyncio.to_thread(
                    self.docker.launch, task_id, segment_id, token, workspace, browser_environment
                )
            else:
                container_id = await asyncio.to_thread(
                    self.docker.launch, task_id, segment_id, token, workspace
                )
            await self.database.execute(
                "UPDATE execution_segments SET container_id=$2 WHERE id=$1",
                __import__("uuid").UUID(segment_id),
                container_id,
            )
            await self.database.append_event(
                task_id, "worker_started", {"segment_id": segment_id, "container_id": container_id}
            )
        except ConflictError:
            await self.database.complete_segment(segment_id, token)
        except DockerUnavailable as exc:
            await self.database.complete_segment(
                segment_id, token, {"code": "docker_unavailable", "message": str(exc)}
            )
            await self.database.set_task_state(
                task_id,
                "failed",
                {"stage": "failed"},
                error={"code": "docker_unavailable", "message": str(exc)},
            )

    async def _schedule_one(self) -> None:
        event = await self.database.claim_due_event(self.settings.lease_seconds)
        if not event:
            return
        task_id = str(event["task_id"])
        task = await self.database.get_task(task_id)
        if not task or task["status"] == "cancelled":
            await self.database.deliver_scheduled_event(str(event["id"]), str(event["lease_token"]))
            return
        try:
            await self.database.enqueue(
                task_id,
                event["input_revision"],
                {
                    "kind": "resume",
                    "resume": {"event": event["event_type"], "event_id": str(event["id"])},
                },
            )
            await self.database.deliver_scheduled_event(str(event["id"]), str(event["lease_token"]))
        except Exception as exc:  # noqa: BLE001 - scheduler must record and survive a malformed due event
            await self.database.append_event(
                task_id, "reminder_dispatch_failed", {"error": str(exc)}
            )
