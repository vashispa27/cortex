from __future__ import annotations

import asyncio
import json
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from asyncpg import PostgresError
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from .artifacts import ArtifactStore
from .database import ConflictError, Database, NotFoundError
from .dispatcher import Dispatcher, DockerUnavailable, LocalDockerBackend
from .migrate import migrate
from .schemas import (
    ControlRequest,
    CreateTaskRequest,
    InputPatch,
    InteractionResponse,
)
from .settings import Settings


def wire_task(task: dict[str, Any], base: str = "/v1/tasks") -> dict[str, Any]:
    identifier = str(task["id"])
    return {
        "task_id": identifier,
        "status": task["status"],
        "version": task["version"],
        "input_revision": task["input_revision"],
        "objective": task["objective"],
        "timezone": task["timezone"],
        "progress": task["progress"],
        "plan": task["plan"],
        "outcome": task["outcome"],
        "error": task["error"],
        "trace_ref": task["trace_ref"],
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
        "urls": {
            "self": f"{base}/{identifier}",
            "events": f"{base}/{identifier}/events",
            "interactions": f"{base}/{identifier}/interactions",
            "artifacts": f"{base}/{identifier}/artifacts",
        },
    }


def require_idempotency(key: str | None) -> str:
    if not key or len(key) > 200:
        raise HTTPException(
            400,
            detail={
                "error": "idempotency_key_required",
                "message": "Supply a bounded Idempotency-Key header.",
            },
        )
    return key


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    db = Database(settings.database_url)
    dispatcher = Dispatcher(db, settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await migrate(settings.database_url)
        await db.open()
        await dispatcher.startup_recovery()
        runner = asyncio.create_task(dispatcher.run(), name="cortex-agent-db-dispatcher")
        try:
            yield
        finally:
            dispatcher.stop()
            await runner
            await db.close()

    app = FastAPI(title="Cortex Agent API", version="1.0.0", lifespan=lifespan)
    app.state.db = db
    app.state.settings = settings
    app.state.dispatcher = dispatcher

    async def local_auth(authorization: str | None = Header(default=None)) -> None:
        expected = f"Bearer {settings.api_token}"
        if not authorization or not secrets.compare_digest(authorization, expected):
            raise HTTPException(
                401,
                detail={
                    "error": "unauthorized",
                    "message": "A valid local bearer token is required.",
                },
            )

    @app.exception_handler(ConflictError)
    async def conflict_handler(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse({"error": "conflict", "message": str(exc)}, status_code=409)

    @app.exception_handler(NotFoundError)
    async def not_found_handler(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse({"error": "not_found", "message": str(exc)}, status_code=404)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> Response:
        try:
            await db.fetchrow("SELECT 1 AS ready")
            if settings.docker_enabled:
                await asyncio.to_thread(LocalDockerBackend(settings).assert_available)
        except (DockerUnavailable, PostgresError, OSError) as exc:
            return JSONResponse({"status": "not_ready", "message": str(exc)}, status_code=503)
        return JSONResponse({"status": "ready"})

    @app.post("/v1/tasks", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(local_auth)])
    async def create_task(
        body: CreateTaskRequest,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ) -> Response:
        key = require_idempotency(idempotency_key)
        payload = body.model_dump(mode="json")
        stored, _ = await db.idempotent_response("create_task", key, payload)
        if stored:
            return JSONResponse(stored, status_code=202)
        task_id = str(uuid.uuid4())
        payload["_execution_profile"] = settings.execution_profile
        workspace = settings.workspace_root / task_id
        workspace.mkdir(parents=True, exist_ok=False)
        task = await db.create_task(task_id, payload, str(workspace))
        result = wire_task(task)
        result = {
            "task_id": task_id,
            "version": task["version"],
            "status": task["status"],
            "urls": result["urls"],
        }
        await db.finish_idempotency("create_task", key, 202, result)
        return JSONResponse(result, status_code=202)

    @app.get("/v1/tasks", dependencies=[Depends(local_auth)])
    async def list_tasks() -> list[dict[str, Any]]:
        return [wire_task(task) for task in await db.list_tasks()]

    @app.get("/v1/tasks/{task_id}", dependencies=[Depends(local_auth)])
    async def get_task(task_id: str) -> dict[str, Any]:
        task = await db.get_task(task_id)
        if not task:
            raise NotFoundError(task_id)
        response = wire_task(task)
        response["pending_interaction"] = next(
            (item for item in await db.interactions(task_id) if item["state"] == "pending"), None
        )
        response["artifacts"] = await ArtifactStore(settings.workspace_root, db).list(task_id)
        return response

    @app.get("/v1/tasks/{task_id}/events", dependencies=[Depends(local_auth)])
    async def events(
        task_id: str, after_id: int = 0, limit: int = 100, request: Request = None
    ) -> Response:
        limit = min(max(limit, 1), 500)

        async def event_rows() -> list[dict[str, Any]]:
            return await db.fetch(
                "SELECT * FROM application_events WHERE task_id=$1 AND id>$2 ORDER BY id LIMIT $3",
                uuid.UUID(task_id),
                after_id,
                limit,
            )

        wants_sse = request and "text/event-stream" in request.headers.get("accept", "")
        if not wants_sse:
            return JSONResponse(jsonable_encoder(await event_rows()))

        async def stream() -> AsyncIterator[str]:
            cursor = after_id
            for _ in range(30):
                rows = await db.fetch(
                    "SELECT * FROM application_events WHERE task_id=$1 AND id>$2 ORDER BY id LIMIT $3",
                    uuid.UUID(task_id),
                    cursor,
                    limit,
                )
                for item in rows:
                    cursor = item["id"]
                    yield f"id: {item['id']}\nevent: {item['event_type']}\ndata: {json.dumps(jsonable_encoder(item))}\n\n"
                if await request.is_disconnected():
                    return
                await asyncio.sleep(1)

        return StreamingResponse(stream(), media_type="text/event-stream")

    @app.get("/v1/tasks/{task_id}/interactions", dependencies=[Depends(local_auth)])
    async def interactions(task_id: str) -> list[dict[str, Any]]:
        if not await db.get_task(task_id):
            raise NotFoundError(task_id)
        return await db.interactions(task_id)

    @app.post(
        "/v1/tasks/{task_id}/interactions/{interaction_id}/responses",
        dependencies=[Depends(local_auth)],
    )
    async def respond(
        task_id: str,
        interaction_id: str,
        body: InteractionResponse,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ) -> Response:
        key = require_idempotency(idempotency_key)
        request_body = body.model_dump(mode="json")
        scope = f"interaction:{task_id}:{interaction_id}"
        stored, _ = await db.idempotent_response(scope, key, request_body)
        if stored:
            return JSONResponse(stored, status_code=202)
        response_data = {
            key: value
            for key, value in request_body.items()
            if key != "expected_version" and value is not None
        }
        _interaction, duplicate = await db.resolve_interaction(
            task_id, interaction_id, body.expected_version, response_data
        )
        task = await db.get_task(task_id)
        assert task
        if not duplicate:
            segment_id = _interaction["queued_segment_id"]
            await db.append_event(
                task_id,
                "interaction_resolved",
                {"interaction_id": interaction_id, "segment_id": segment_id},
            )
        else:
            segment_id = None
        result = {
            "interaction_id": interaction_id,
            "state": "resolved",
            "duplicate": duplicate,
            "queued_segment_id": segment_id,
            "task_version": (await db.get_task(task_id))["version"],
        }
        await db.finish_idempotency(scope, key, 202, result)
        return JSONResponse(result, status_code=202)

    @app.patch("/v1/tasks/{task_id}/inputs", dependencies=[Depends(local_auth)])
    async def patch_inputs(
        task_id: str,
        body: InputPatch,
        expected_version: int,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ) -> Response:
        key = require_idempotency(idempotency_key)
        patch = body.model_dump(mode="json", exclude_none=True)
        scope = f"inputs:{task_id}"
        stored, _ = await db.idempotent_response(
            scope, key, {"expected_version": expected_version, "patch": patch}
        )
        if stored:
            return JSONResponse(stored, status_code=202)
        task = await db.edit_inputs(task_id, expected_version, patch)
        segment_id = await db.enqueue(
            task_id,
            task["input_revision"],
            {
                "kind": "reconcile",
                "resume": {
                    "decision": "request_changes",
                    "feedback": "Inputs were revised; reconcile before continuing.",
                },
            },
        )
        result = {
            "task_id": task_id,
            "version": task["version"],
            "input_revision": task["input_revision"],
            "invalidated": True,
            "queued_segment_id": segment_id,
        }
        await db.finish_idempotency(scope, key, 202, result)
        return JSONResponse(result, status_code=202)

    async def control(task_id: str, action: str, body: ControlRequest) -> Response:
        task = await db.pause_or_control(task_id, body.expected_version, action)
        # A plain resume of an approval/input/event wait only restores its prior status; it cannot
        # fabricate a LangGraph interrupt value. Typed interaction responses are the only resume path.
        if action == "retry" or (action == "resume" and task["status"] == "queued"):
            segment_id = await db.enqueue(
                task_id, task["input_revision"], {"kind": "resume", "resume": {"control": action}}
            )
        else:
            segment_id = None
        return JSONResponse(
            {
                "task_id": task_id,
                "status": task["status"],
                "version": task["version"],
                "queued_segment_id": segment_id,
            },
            status_code=202,
        )

    @app.post("/v1/tasks/{task_id}/pause", dependencies=[Depends(local_auth)])
    async def pause(task_id: str, body: ControlRequest) -> Response:
        return await control(task_id, "pause", body)

    @app.post("/v1/tasks/{task_id}/resume", dependencies=[Depends(local_auth)])
    async def resume(task_id: str, body: ControlRequest) -> Response:
        return await control(task_id, "resume", body)

    @app.post("/v1/tasks/{task_id}/cancel", dependencies=[Depends(local_auth)])
    async def cancel(task_id: str, body: ControlRequest) -> Response:
        return await control(task_id, "cancel", body)

    @app.post("/v1/tasks/{task_id}/retry", dependencies=[Depends(local_auth)])
    async def retry(task_id: str, body: ControlRequest) -> Response:
        return await control(task_id, "retry", body)

    @app.get("/v1/tasks/{task_id}/artifacts", dependencies=[Depends(local_auth)])
    async def artifacts(task_id: str) -> list[dict[str, Any]]:
        if not await db.get_task(task_id):
            raise NotFoundError(task_id)
        return await ArtifactStore(settings.workspace_root, db).list(task_id)

    @app.get("/v1/tasks/{task_id}/artifacts/{artifact_id}", dependencies=[Depends(local_auth)])
    async def artifact(task_id: str, artifact_id: str) -> FileResponse:
        try:
            item, path = await ArtifactStore(settings.workspace_root, db).read(task_id, artifact_id)
        except FileNotFoundError:
            raise NotFoundError(artifact_id)
        return FileResponse(path, media_type=item["media_type"], filename=item["logical_name"])

    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("cortex_agent_api.main:app", host="127.0.0.1", port=8790, reload=False)
