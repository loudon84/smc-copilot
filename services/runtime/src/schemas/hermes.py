from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HermesRunCreate(BaseModel):
    model: str | None = None
    input: str | dict[str, Any] | list[Any] = Field(default="")
    metadata: dict[str, Any] | None = None


class HermesRunResponse(BaseModel):
    run_id: str
    status: str | None = None
    raw: dict[str, Any] | None = None


class HermesModelsResponse(BaseModel):
    models: list[dict[str, Any]]
    raw: dict[str, Any] | None = None


class HermesRunEventsResponse(BaseModel):
    run_id: str
    events: list[dict[str, Any]]
