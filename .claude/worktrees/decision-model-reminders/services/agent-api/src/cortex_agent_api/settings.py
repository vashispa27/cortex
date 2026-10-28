from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    database_url: str = Field(
        default="postgresql://cortex:cortex@127.0.0.1:54329/cortex_agent",
        validation_alias=AliasChoices("CORTEX_AGENT_DATABASE_URL", "DATABASE_URL"),
    )
    # Explicitly replace this for every non-fixture run. A bearer check is always enforced.
    api_token: str = Field(
        default="local-development-token-change-me",
        min_length=16,
        validation_alias="CORTEX_AGENT_API_TOKEN",
    )
    data_dir: Path = Field(default=Path(".data"), validation_alias="CORTEX_AGENT_DATA_DIR")
    docker_image: str = Field(
        default="cortex-agent-worker:local", validation_alias="CORTEX_AGENT_DOCKER_IMAGE"
    )
    docker_network: str | None = Field(default=None, validation_alias="CORTEX_AGENT_DOCKER_NETWORK")
    docker_enabled: bool = Field(default=True, validation_alias="CORTEX_AGENT_DOCKER_ENABLED")
    model_mode: str = Field(
        default="fake", validation_alias="CORTEX_AGENT_MODEL_MODE"
    )  # fake | openai
    openai_api_key: str | None = Field(default=None, validation_alias="CORTEX_AGENT_OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini", validation_alias="CORTEX_AGENT_OPENAI_MODEL")
    openrouter_api_key: str | None = Field(default=None, validation_alias="OPENROUTER_API_KEY")
    openrouter_model: str | None = Field(default=None, validation_alias="OPENROUTER_MODEL")
    search_mode: str = Field(
        default="fake", validation_alias="CORTEX_AGENT_SEARCH_MODE"
    )  # fake | tavily
    tavily_api_key: str | None = Field(default=None, validation_alias="CORTEX_AGENT_TAVILY_API_KEY")
    trace_mode: str = Field(
        default="off", validation_alias="CORTEX_AGENT_TRACE_MODE"
    )  # off | metadata | redacted
    dispatcher_poll_seconds: float = Field(
        default=0.5, validation_alias="CORTEX_AGENT_DISPATCHER_POLL_SECONDS"
    )
    lease_seconds: int = Field(default=90, validation_alias="CORTEX_AGENT_LEASE_SECONDS")
    task_cpu: float = Field(default=1.0, validation_alias="CORTEX_AGENT_TASK_CPU")
    task_memory_mb: int = Field(default=512, validation_alias="CORTEX_AGENT_TASK_MEMORY_MB")
    task_pids_limit: int = Field(default=64, validation_alias="CORTEX_AGENT_TASK_PIDS_LIMIT")
    task_runtime_seconds: int = Field(
        default=120, validation_alias="CORTEX_AGENT_TASK_RUNTIME_SECONDS"
    )

    @field_validator("openrouter_api_key", "openai_api_key", "tavily_api_key")
    @classmethod
    def valid_provider_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if any(not 33 <= ord(character) <= 126 for character in value):
            raise ValueError(
                "Provider API key contains whitespace, a control character, or non-ASCII text. Export only the key, without a Bearer prefix or line breaks."
            )
        return value

    @field_validator("openrouter_model", "openai_model")
    @classmethod
    def valid_model_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @property
    def execution_profile(self) -> str:
        model = (
            self.openrouter_model
            if self.model_mode == "openrouter"
            else self.openai_model
            if self.model_mode == "openai"
            else "fake"
        )
        return hashlib.sha256(
            json.dumps(
                {"mode": self.model_mode, "model": model, "search": self.search_mode},
                sort_keys=True,
            ).encode()
        ).hexdigest()

    @property
    def workspace_root(self) -> Path:
        return self.data_dir.resolve() / "tasks"
