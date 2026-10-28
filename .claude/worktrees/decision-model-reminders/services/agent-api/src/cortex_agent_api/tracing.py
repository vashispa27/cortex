from __future__ import annotations

import os
import re
from contextlib import nullcontext
from typing import Any

from langsmith import Client, tracing_context

from .settings import Settings

SECRET = re.compile(r"(?i)(api[_-]?key|authorization|bearer|password|secret)\s*[:=]\s*[^\s,]+")


def redact(value: Any) -> Any:
    """Conservative trace anonymizer; content export remains an explicit choice."""
    if isinstance(value, str):
        return SECRET.sub(r"\1=[REDACTED]", value)[:2_000]
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in {"conversation", "master_resume"}:
                continue
            cleaned[str(key)] = (
                "[REDACTED]"
                if any(
                    token in lowered
                    for token in ("key", "token", "secret", "password", "authorization")
                )
                else redact(item)
            )
        return cleaned
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def trace_scope(settings: Settings, task_id: str, segment_id: str, input_revision: int):
    """Enable LangSmith only with explicit privacy mode and credentials."""
    if settings.trace_mode == "off" or not os.getenv("LANGSMITH_API_KEY"):
        return nullcontext()
    if settings.trace_mode == "metadata":
        client = Client(hide_inputs=True, hide_outputs=True)
    elif settings.trace_mode == "redacted":
        client = Client(hide_inputs=redact, hide_outputs=redact)
    else:
        raise ValueError("CORTEX_AGENT_TRACE_MODE must be off, metadata, or redacted")
    return tracing_context(
        project_name=os.getenv("LANGSMITH_PROJECT", "cortex-agent-api"),
        client=client,
        metadata={
            "task_id": task_id,
            "segment_id": segment_id,
            "input_revision": input_revision,
            "privacy_mode": settings.trace_mode,
        },
        tags=["cortex-agent-api", settings.trace_mode],
    )
