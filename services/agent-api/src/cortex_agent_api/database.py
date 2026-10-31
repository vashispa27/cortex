from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

import asyncpg


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def row(record: asyncpg.Record | None) -> dict[str, Any] | None:
    return dict(record) if record else None


class ConflictError(Exception):
    pass


class NotFoundError(Exception):
    pass


class Database:
    def __init__(self, url: str) -> None:
        self.url = url
        self.pool: asyncpg.Pool | None = None

    async def open(self) -> None:
        async def configure(conn: asyncpg.Connection) -> None:
            for typename in ("json", "jsonb"):
                await conn.set_type_codec(
                    typename, schema="pg_catalog", encoder=str, decoder=json.loads, format="text"
                )

        self.pool = await asyncpg.create_pool(self.url, min_size=1, max_size=12, init=configure)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[asyncpg.Connection]:
        assert self.pool
        async with self.pool.acquire() as conn, conn.transaction():
            yield conn

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        assert self.pool
        async with self.pool.acquire() as conn:
            return row(await conn.fetchrow(query, *args))

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        assert self.pool
        async with self.pool.acquire() as conn:
            return [dict(item) for item in await conn.fetch(query, *args)]

    async def execute(self, query: str, *args: Any) -> str:
        assert self.pool
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def append_event(
        self,
        task_id: str | None,
        event_type: str,
        payload: dict[str, Any],
        trace_ref: str | None = None,
    ) -> int:
        item = await self.fetchrow(
            """INSERT INTO application_events(task_id,event_type,payload,trace_ref)
               VALUES($1,$2,$3::jsonb,$4) RETURNING id""",
            uuid.UUID(task_id) if task_id else None,
            event_type,
            canonical_json(payload),
            trace_ref,
        )
        assert item
        return item["id"]

    async def idempotent_response(
        self, scope: str, key: str, request: Any
    ) -> tuple[dict[str, Any] | None, str]:
        """Return a stored response or reserve a key; conflicting payloads raise."""
        request_hash = digest(request)
        async with self.transaction() as conn:
            existing = await conn.fetchrow(
                "SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE scope=$1 AND key=$2 FOR UPDATE",
                scope,
                key,
            )
            if existing:
                if existing["request_hash"] != request_hash:
                    raise ConflictError("idempotency key was reused with a different payload")
                if existing["response_body"] is None:
                    raise ConflictError("idempotency key is currently being processed")
                return dict(existing["response_body"]), "replayed"
            await conn.execute(
                "INSERT INTO idempotency_keys(scope,key,request_hash) VALUES($1,$2,$3)",
                scope,
                key,
                request_hash,
            )
        return None, "reserved"

    async def finish_idempotency(
        self, scope: str, key: str, status: int, body: dict[str, Any]
    ) -> None:
        await self.execute(
            "UPDATE idempotency_keys SET response_status=$3,response_body=$4::jsonb WHERE scope=$1 AND key=$2",
            scope,
            key,
            status,
            canonical_json(body),
        )

    async def create_task(
        self, task_id: str, payload: dict[str, Any], workspace: str, queue: bool = True
    ) -> dict[str, Any]:
        """Store a new job. queue=False is for jobs the service runs itself (browser jobs)."""
        task_uuid = uuid.UUID(task_id)
        async with self.transaction() as conn:
            await conn.execute(
                """INSERT INTO tasks(id,thread_id,status,objective,timezone,limits,progress)
                   VALUES($1,$2,'queued',$3,$4,$5::jsonb,$6::jsonb)""",
                task_uuid,
                f"task-{task_id}",
                payload["task"],
                payload["timezone"],
                canonical_json(payload["limits"]),
                canonical_json({"stage": "queued", "workspace": workspace}),
            )
            await conn.execute(
                "INSERT INTO task_input_versions(task_id,revision,payload,content_hash) VALUES($1,1,$2::jsonb,$3)",
                task_uuid,
                canonical_json(payload),
                digest(payload),
            )
            if browser := payload.get("_browser"):
                await conn.execute(
                    "UPDATE browser_jobs SET active=FALSE WHERE task_id IN (SELECT id FROM tasks WHERE status IN ('completed','cancelled','failed'))"
                )
                try:
                    await conn.execute(
                        "INSERT INTO browser_jobs(task_id,share_id,tab_id,site,browser_instance) VALUES($1,$2,$3,$4,$5)",
                        task_uuid,
                        browser["id"],
                        browser["tab_id"],
                        browser["site"],
                        browser.get("browser_instance", ""),
                    )
                except asyncpg.UniqueViolationError as exc:
                    raise ConflictError(
                        "Another agent is still using this tab. Stop it from its chat or the Agents page first."
                    ) from exc
            if queue:
                await conn.execute(
                    "INSERT INTO execution_segments(id,task_id,input_revision,command,state) VALUES($1,$2,1,$3::jsonb,'queued')",
                    uuid.uuid4(),
                    task_uuid,
                    canonical_json({"kind": "start"}),
                )
        await self.append_event(task_id, "task_created", {"input_revision": 1})
        return (await self.get_task(task_id)) or {}

    async def get_task(self, task_id: str) -> dict[str, Any] | None:
        return await self.fetchrow("SELECT * FROM tasks WHERE id=$1", uuid.UUID(task_id))

    async def task_inputs(self, task_id: str, revision: int | None = None) -> dict[str, Any] | None:
        if revision is None:
            return await self.fetchrow(
                """SELECT v.* FROM task_input_versions v JOIN tasks t ON t.id=v.task_id
                   WHERE v.task_id=$1 AND v.revision=t.input_revision""",
                uuid.UUID(task_id),
            )
        return await self.fetchrow(
            "SELECT * FROM task_input_versions WHERE task_id=$1 AND revision=$2",
            uuid.UUID(task_id),
            revision,
        )

    async def list_tasks(self) -> list[dict[str, Any]]:
        return await self.fetch("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100")

    async def enqueue(self, task_id: str, revision: int, command: dict[str, Any]) -> str:
        segment_id = str(uuid.uuid4())
        async with self.transaction() as conn:
            active = await conn.fetchval(
                "SELECT 1 FROM execution_segments WHERE task_id=$1 AND state IN ('queued','leased')",
                uuid.UUID(task_id),
            )
            if active:
                raise ConflictError("task already has an active execution segment")
            await conn.execute(
                "INSERT INTO execution_segments(id,task_id,input_revision,command,state) VALUES($1,$2,$3,$4::jsonb,'queued')",
                uuid.UUID(segment_id),
                uuid.UUID(task_id),
                revision,
                canonical_json(command),
            )
        await self.append_event(
            task_id, "segment_queued", {"segment_id": segment_id, "command": command}
        )
        return segment_id

    async def claim_segment(
        self, lease_seconds: int, profile: str | None = None
    ) -> dict[str, Any] | None:
        async with self.transaction() as conn:
            item = await conn.fetchrow(
                """SELECT s.* FROM execution_segments s JOIN task_input_versions v
                   ON v.task_id=s.task_id AND v.revision=s.input_revision
                   WHERE s.state='queued' AND ($1::text IS NULL OR v.payload->>'_execution_profile'=$1
                     OR NOT (v.payload ? '_execution_profile'))
                   ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT 1""",
                profile,
            )
            if not item:
                return None
            token = uuid.uuid4()
            claimed = await conn.fetchrow(
                """UPDATE execution_segments SET state='leased',lease_token=$2,
                     lease_expires_at=now()+$3::interval,attempt=attempt+1,started_at=now()
                   WHERE id=$1 RETURNING *""",
                item["id"],
                token,
                timedelta(seconds=lease_seconds),
            )
            await conn.execute(
                "UPDATE tasks SET status='running',version=version+1,updated_at=now() WHERE id=$1 AND status <> 'cancelled'",
                item["task_id"],
            )
            return dict(claimed)

    async def recover_expired_leases(self) -> int:
        rows = await self.fetch(
            """UPDATE execution_segments SET state='queued',lease_token=NULL,lease_expires_at=NULL
               WHERE state='leased' AND lease_expires_at < now() RETURNING id,task_id"""
        )
        for item in rows:
            await self.append_event(
                str(item["task_id"]), "segment_lease_expired", {"segment_id": str(item["id"])}
            )
        timers = await self.fetch(
            """UPDATE scheduled_events SET state='pending',lease_token=NULL,lease_expires_at=NULL
               WHERE state='leased' AND lease_expires_at < now() RETURNING id,task_id"""
        )
        for item in timers:
            await self.append_event(
                str(item["task_id"]),
                "scheduled_event_lease_expired",
                {"event_id": str(item["id"])},
            )
        return len(rows) + len(timers)

    async def heartbeat(self, segment_id: str, token: str, lease_seconds: int) -> bool:
        result = await self.execute(
            """UPDATE execution_segments SET lease_expires_at=now()+$3::interval
               WHERE id=$1 AND lease_token=$2 AND state='leased'""",
            uuid.UUID(segment_id),
            uuid.UUID(token),
            timedelta(seconds=lease_seconds),
        )
        return result != "UPDATE 0"

    async def complete_segment(
        self, segment_id: str, token: str, error: dict[str, Any] | None = None
    ) -> bool:
        result = await self.execute(
            """UPDATE execution_segments SET state=$3,finished_at=now(),error=$4::jsonb
               WHERE id=$1 AND lease_token=$2 AND state='leased'""",
            uuid.UUID(segment_id),
            uuid.UUID(token),
            "failed" if error else "completed",
            canonical_json(error) if error else None,
        )
        return result != "UPDATE 0"

    async def set_task_state(
        self,
        task_id: str,
        status: str,
        progress: dict[str, Any],
        *,
        outcome: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None,
        plan: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        item = await self.fetchrow(
            """UPDATE tasks SET status=$2,progress=$3::jsonb,
                 outcome=COALESCE($4::jsonb,outcome),error=$5::jsonb,plan=COALESCE($6::jsonb,plan),
                 version=version+1,updated_at=now() WHERE id=$1 RETURNING *""",
            uuid.UUID(task_id),
            status,
            canonical_json(progress),
            canonical_json(outcome) if outcome else None,
            canonical_json(error) if error else None,
            canonical_json(plan) if plan else None,
        )
        if not item:
            raise NotFoundError(task_id)
        return item

    async def upsert_interaction(
        self, task_id: str, revision: int, interrupt: dict[str, Any]
    ) -> dict[str, Any]:
        item = await self.fetchrow(
            """INSERT INTO interactions(id,task_id,input_revision,kind,operation,payload,payload_hash,preview,state)
               VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,'pending')
               ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,preview=EXCLUDED.preview
               RETURNING *""",
            interrupt["interaction_id"],
            uuid.UUID(task_id),
            revision,
            interrupt["kind"],
            interrupt["operation"],
            canonical_json(interrupt["payload"]),
            digest(interrupt["payload"]),
            canonical_json(interrupt["preview"]),
        )
        assert item
        return item

    async def interactions(self, task_id: str) -> list[dict[str, Any]]:
        return await self.fetch(
            "SELECT * FROM interactions WHERE task_id=$1 ORDER BY created_at", uuid.UUID(task_id)
        )

    async def resolve_interaction(
        self, task_id: str, interaction_id: str, expected_version: int, response: dict[str, Any]
    ) -> tuple[dict[str, Any], bool]:
        async with self.transaction() as conn:
            task = await conn.fetchrow(
                "SELECT * FROM tasks WHERE id=$1 FOR UPDATE", uuid.UUID(task_id)
            )
            if not task:
                raise NotFoundError(task_id)
            interaction = await conn.fetchrow(
                "SELECT * FROM interactions WHERE id=$1 AND task_id=$2 FOR UPDATE",
                interaction_id,
                uuid.UUID(task_id),
            )
            if not interaction:
                raise NotFoundError(interaction_id)
            if task["version"] != expected_version:
                if interaction["state"] == "resolved" and interaction["response"] == response:
                    return dict(interaction), True
                raise ConflictError("task version is stale")
            if interaction["state"] != "pending":
                if interaction["state"] == "resolved" and interaction["response"] == response:
                    return dict(interaction), True
                raise ConflictError("interaction is no longer pending")
            if (
                task["status"] not in {"waiting_input", "waiting_approval"}
                or interaction["input_revision"] != task["input_revision"]
            ):
                raise ConflictError("task is not waiting for this interaction revision")
            if interaction["kind"] == "approval":
                if (
                    response.get("decision") not in {"approve", "reject", "request_changes"}
                    or response.get("answer") is not None
                ):
                    raise ConflictError("approval requires a decision, not a clarification answer")
            elif (
                not isinstance(response.get("answer"), dict) or response.get("decision") is not None
            ):
                raise ConflictError("clarification requires a typed answer, not an approval")
            # Publication of waiting_* happens only after the graph invocation has returned.
            # Close the publishing segment in this same transaction before queuing its continuation.
            await conn.execute(
                "UPDATE execution_segments SET state='completed',finished_at=now() WHERE task_id=$1 AND state='leased'",
                uuid.UUID(task_id),
            )
            segment_id = uuid.uuid4()
            await conn.execute(
                "INSERT INTO execution_segments(id,task_id,input_revision,command,state) VALUES($1,$2,$3,$4::jsonb,'queued')",
                segment_id,
                uuid.UUID(task_id),
                task["input_revision"],
                canonical_json({"kind": "resume", "resume": response}),
            )
            await conn.execute(
                "UPDATE interactions SET state='resolved',response=$2::jsonb,resolved_at=now() WHERE id=$1",
                interaction_id,
                canonical_json(response),
            )
            await conn.execute(
                "UPDATE tasks SET status='queued',version=version+1,updated_at=now() WHERE id=$1",
                uuid.UUID(task_id),
            )
            return {
                **dict(interaction),
                "response": response,
                "state": "resolved",
                "queued_segment_id": str(segment_id),
            }, False

    async def edit_inputs(
        self, task_id: str, expected_version: int, patch: dict[str, Any]
    ) -> dict[str, Any]:
        async with self.transaction() as conn:
            task = await conn.fetchrow(
                "SELECT * FROM tasks WHERE id=$1 FOR UPDATE", uuid.UUID(task_id)
            )
            if not task:
                raise NotFoundError(task_id)
            if task["version"] != expected_version:
                raise ConflictError("task version is stale")
            if task["status"] not in {
                "paused",
                "waiting_input",
                "waiting_approval",
                "waiting_event",
            }:
                raise ConflictError("pause the task at a safe boundary before editing inputs")
            current = await conn.fetchrow(
                "SELECT payload FROM task_input_versions WHERE task_id=$1 AND revision=$2",
                uuid.UUID(task_id),
                task["input_revision"],
            )
            assert current
            merged = {**current["payload"], **{k: v for k, v in patch.items() if v is not None}}
            revision = task["input_revision"] + 1
            await conn.execute(
                "INSERT INTO task_input_versions(task_id,revision,payload,content_hash) VALUES($1,$2,$3::jsonb,$4)",
                uuid.UUID(task_id),
                revision,
                canonical_json(merged),
                digest(merged),
            )
            await conn.execute(
                "UPDATE interactions SET state='invalidated' WHERE task_id=$1 AND state='pending'",
                uuid.UUID(task_id),
            )
            await conn.execute(
                "UPDATE scheduled_events SET state='invalidated' WHERE task_id=$1 AND state='pending'",
                uuid.UUID(task_id),
            )
            updated = await conn.fetchrow(
                """UPDATE tasks SET input_revision=$2,status='queued',version=version+1,updated_at=now(),
                     progress=$3::jsonb WHERE id=$1 RETURNING *""",
                uuid.UUID(task_id),
                revision,
                canonical_json({"stage": "reconciliation", "reason": "inputs_revised"}),
            )
        await self.append_event(task_id, "inputs_revised", {"input_revision": revision})
        return dict(updated)

    async def persist_source(self, task_id: str, revision: int, source: dict[str, Any]) -> None:
        source_hash = digest({"url": source["url"], "snippet": source["snippet"]})
        await self.execute(
            """INSERT INTO sources(id,task_id,input_revision,url,title,retrieved_at,evidence,is_synthetic,sha256)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(task_id,input_revision,url,sha256) DO NOTHING""",
            uuid.uuid4(),
            uuid.UUID(task_id),
            revision,
            source["url"],
            source.get("title"),
            datetime.fromisoformat(source["retrieved_at"]),
            source["snippet"],
            source.get("synthetic", False),
            source_hash,
        )

    async def schedule_reminder(
        self, task_id: str, revision: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        delivery_key = f"{task_id}:reminder:{revision}:{digest(payload)[:16]}"
        item = await self.fetchrow(
            """INSERT INTO scheduled_events(id,task_id,input_revision,event_type,wake_at,payload,state,delivery_key)
               VALUES($1,$2,$3,'reminder_due',$4,$5::jsonb,'pending',$6)
               ON CONFLICT(delivery_key) DO UPDATE SET payload=EXCLUDED.payload RETURNING *""",
            uuid.uuid4(),
            uuid.UUID(task_id),
            revision,
            datetime.fromisoformat(payload["wake_at"]),
            canonical_json(payload),
            delivery_key,
        )
        assert item
        await self.append_event(
            task_id, "reminder_scheduled", {"event_id": str(item["id"]), **payload}
        )
        return item

    async def claim_due_event(self, lease_seconds: int) -> dict[str, Any] | None:
        async with self.transaction() as conn:
            item = await conn.fetchrow(
                """SELECT * FROM scheduled_events WHERE state='pending' AND wake_at <= now()
                   ORDER BY wake_at FOR UPDATE SKIP LOCKED LIMIT 1"""
            )
            if not item:
                return None
            token = uuid.uuid4()
            updated = await conn.fetchrow(
                """UPDATE scheduled_events SET state='leased',lease_token=$2,lease_expires_at=now()+$3::interval
                   WHERE id=$1 RETURNING *""",
                item["id"],
                token,
                timedelta(seconds=lease_seconds),
            )
            return dict(updated)

    async def deliver_scheduled_event(self, event_id: str, token: str) -> bool:
        result = await self.execute(
            """UPDATE scheduled_events SET state='delivered',delivered_at=now()
               WHERE id=$1 AND lease_token=$2 AND state='leased'""",
            uuid.UUID(event_id),
            uuid.UUID(token),
        )
        return result != "UPDATE 0"

    async def record_reminder_delivery(self, task_id: str, event_id: str) -> bool:
        """Suppress duplicate externally visible reminder events after a scheduler crash/retry."""
        item = await self.fetchrow(
            """INSERT INTO action_records(id,task_id,action_key,action_type,request_hash,result,state,completed_at)
               VALUES($1,$2,$3,'reminder_delivery',$4,$5::jsonb,'completed',now())
               ON CONFLICT(task_id,action_key) DO NOTHING RETURNING id""",
            uuid.uuid4(),
            uuid.UUID(task_id),
            f"reminder_delivery:{event_id}",
            digest({"event_id": event_id}),
            canonical_json({"event_id": event_id}),
        )
        return item is not None

    async def pause_or_control(
        self, task_id: str, expected_version: int, action: str
    ) -> dict[str, Any]:
        async with self.transaction() as conn:
            task = await conn.fetchrow(
                "SELECT * FROM tasks WHERE id=$1 FOR UPDATE", uuid.UUID(task_id)
            )
            if not task:
                raise NotFoundError(task_id)
            if task["version"] != expected_version:
                raise ConflictError("task version is stale")
            if action == "resume" and task["status"] != "paused":
                raise ConflictError("only a plainly paused task can be resumed")
            if action == "retry" and task["status"] != "failed":
                raise ConflictError("only a failed task can be retried")
            if task["status"] in {"completed", "cancelled"} and action != "cancel":
                raise ConflictError("terminal tasks cannot be controlled")
            if action == "cancel":
                await conn.execute(
                    "UPDATE interactions SET state='cancelled' WHERE task_id=$1 AND state='pending'",
                    uuid.UUID(task_id),
                )
                await conn.execute(
                    "UPDATE scheduled_events SET state='cancelled' WHERE task_id=$1 AND state IN ('pending','leased')",
                    uuid.UUID(task_id),
                )
                await conn.execute(
                    "UPDATE execution_segments SET state='cancelled' WHERE task_id=$1 AND state='queued'",
                    uuid.UUID(task_id),
                )
            progress = dict(task["progress"])
            if action == "pause":
                progress["paused_from"] = task["status"]
                target = "paused"
            elif action == "resume":
                target = progress.pop("paused_from", "queued")
                progress.pop("browser_reason", None)
            else:
                target = {"cancel": "cancelled", "retry": "queued"}[action]
            item = await conn.fetchrow(
                """UPDATE tasks SET status=$2,progress=$3::jsonb,version=version+1,updated_at=now(),cancelled_at=
                   CASE WHEN $4 THEN now() ELSE cancelled_at END WHERE id=$1 RETURNING *""",
                uuid.UUID(task_id),
                target,
                canonical_json(progress),
                action == "cancel",
            )
        await self.append_event(task_id, f"task_{action}d", {"version": item["version"]})
        return dict(item)
