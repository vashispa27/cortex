from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ExecutionLimits(BaseModel):
    max_model_calls: int = Field(default=8, ge=1, le=40)
    max_tool_calls: int = Field(default=12, ge=1, le=50)
    max_active_seconds: int = Field(default=120, ge=10, le=900)
    max_fetched_bytes: int = Field(default=1_000_000, ge=1_024, le=5_000_000)
    max_artifact_bytes: int = Field(default=1_000_000, ge=1_024, le=5_000_000)


class SupportingDocument(BaseModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._ -]*$")
    content: str = Field(min_length=1, max_length=200_000)
    media_type: str = Field(default="text/plain", max_length=100)


class CreateTaskRequest(BaseModel):
    workflow: Literal["recruiter", "agent"] = "recruiter"
    # Work in the Chrome tab the user is on when the job starts (agent workflow only).
    use_browser_tab: bool = False
    # OpenRouter model chosen in Cortex's settings; overrides OPENROUTER_MODEL for this job.
    model: str | None = Field(default=None, max_length=200, pattern=r"^[A-Za-z0-9._:/@-]+$")
    conversation: str = Field(default="", max_length=100_000)
    task: str = Field(min_length=1, max_length=20_000)
    master_resume: str | None = Field(default=None, max_length=200_000)
    job_description: str | None = Field(default=None, max_length=100_000)
    job_url: HttpUrl | None = None
    timezone: str = "UTC"
    reminder_at: datetime | None = None
    limits: ExecutionLimits = Field(default_factory=ExecutionLimits)
    supporting_documents: list[SupportingDocument] = Field(default_factory=list, max_length=20)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except Exception as exc:
            raise ValueError("timezone must be an IANA timezone, e.g. Asia/Kolkata") from exc
        return value

    @field_validator("reminder_at")
    @classmethod
    def reminder_must_have_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError(
                "reminder_at must include a UTC offset; resolve ambiguous local time before submission"
            )
        return value


class InputPatch(BaseModel):
    conversation: str | None = Field(default=None, min_length=1, max_length=100_000)
    task: str | None = Field(default=None, min_length=1, max_length=20_000)
    master_resume: str | None = Field(default=None, min_length=1, max_length=200_000)
    job_description: str | None = Field(default=None, min_length=1, max_length=100_000)
    job_url: HttpUrl | None = None
    timezone: str | None = None
    reminder_at: datetime | None = None
    supporting_documents: list[SupportingDocument] | None = Field(default=None, max_length=20)

    @field_validator("reminder_at")
    @classmethod
    def reminder_must_have_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("reminder_at must include a UTC offset")
        return value


class InteractionResponse(BaseModel):
    expected_version: int = Field(ge=1)
    decision: Literal["approve", "reject", "request_changes"] | None = None
    answer: dict[str, Any] | None = None
    feedback: str | None = Field(default=None, max_length=20_000)

    @field_validator("answer")
    @classmethod
    def answer_is_json_object(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return value


class TaskResponse(BaseModel):
    task_id: str
    version: int
    status: str
    urls: dict[str, str]


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict[str, Any] | None = None


class ControlRequest(BaseModel):
    expected_version: int


class TaskMessage(BaseModel):
    expected_version: int
    text: str = Field(min_length=1, max_length=4_000)
