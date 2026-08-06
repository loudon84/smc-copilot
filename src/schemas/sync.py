"""Sync API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ConflictResolveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    resolution: str = Field(description="keep_local | take_desired | merge")
