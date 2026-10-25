from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path

from .database import Database

SAFE_ARTIFACT_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,80}$")


class ArtifactStore:
    def __init__(self, root: Path, database: Database) -> None:
        self.root = root.resolve()
        self.database = database

    def workspace(self, task_id: str) -> Path:
        path = (self.root / task_id).resolve()
        if self.root not in path.parents:
            raise ValueError("unsafe task workspace")
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def write(
        self,
        task_id: str,
        revision: int,
        name: str,
        content: bytes,
        media_type: str,
        max_bytes: int,
    ) -> dict:
        if not SAFE_ARTIFACT_NAME.fullmatch(name):
            raise ValueError("artifact name is not safe")
        if len(content) > max_bytes:
            raise ValueError("artifact exceeds the configured task size limit")
        sha = hashlib.sha256(content).hexdigest()
        existing = await self.database.fetchrow(
            """SELECT * FROM artifacts WHERE task_id=$1 AND input_revision=$2 AND logical_name=$3 AND sha256=$4""",
            uuid.UUID(task_id),
            revision,
            name,
            sha,
        )
        if existing:
            return existing
        artifact_id = str(uuid.uuid4())
        relative = f"artifacts/{artifact_id}-{name}"
        target = (self.workspace(task_id) / relative).resolve()
        if self.workspace(task_id) not in target.parents:
            raise ValueError("unsafe artifact path")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        item = await self.database.fetchrow(
            """INSERT INTO artifacts(id,task_id,input_revision,logical_name,media_type,sha256,byte_size,relative_path)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
            uuid.UUID(artifact_id),
            uuid.UUID(task_id),
            revision,
            name,
            media_type,
            sha,
            len(content),
            relative,
        )
        assert item
        await self.database.append_event(
            task_id, "artifact_written", {"artifact_id": artifact_id, "name": name, "sha256": sha}
        )
        return item

    async def read(self, task_id: str, artifact_id: str) -> tuple[dict, Path]:
        item = await self.database.fetchrow(
            "SELECT * FROM artifacts WHERE id=$1 AND task_id=$2",
            uuid.UUID(artifact_id),
            uuid.UUID(task_id),
        )
        if not item:
            raise FileNotFoundError(artifact_id)
        path = (self.workspace(task_id) / item["relative_path"]).resolve()
        if self.workspace(task_id) not in path.parents or not path.is_file():
            raise FileNotFoundError(artifact_id)
        return item, path

    async def list(self, task_id: str) -> list[dict]:
        return await self.database.fetch(
            "SELECT * FROM artifacts WHERE task_id=$1 ORDER BY created_at", uuid.UUID(task_id)
        )
