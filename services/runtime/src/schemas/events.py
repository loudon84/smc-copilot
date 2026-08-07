"""SSE / envelope event models for contract export (Desktop consumable schemas)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ErrorBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str = Field(alias="requestId")


class ErrorEnvelope(BaseModel):
    """Unified Runtime HTTP error envelope (see api.middleware.error_envelope)."""

    error: ErrorBody


class RuntimeJobSseEvent(BaseModel):
    """SSE payload for GET /api/v1/runtime/jobs/{jobId}/events."""

    model_config = ConfigDict(populate_by_name=True)

    event: str
    sequence: int
    level: str = "info"
    message: str
    payload: dict[str, Any] | None = None
    created_at: str | None = Field(default=None, alias="createdAt")


JobEventType = Literal[
    "job.started",
    "job.progress",
    "job.phase_changed",
    "job.completed",
    "job.failed",
    "job.cancelled",
    "job.cancel_requested",
]
