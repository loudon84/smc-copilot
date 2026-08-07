"""Remote task API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class RemoteTaskRejectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reason: str | None = None
