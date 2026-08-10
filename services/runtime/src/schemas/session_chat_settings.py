"""Pydantic schemas for Session Chat Settings (PRD v1.6 FR-04/FR-08)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SessionChatSettingsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    instance_id: str = Field(alias="instanceId")
    session_id: str = Field(alias="sessionId")
    model_id: str | None = Field(default=None, alias="modelId")
    context_folder: str | None = Field(default=None, alias="contextFolder")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")


class SessionChatSettingsPatchBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model_id: str | None = Field(default=None, alias="modelId")
    context_folder: str | None = Field(default=None, alias="contextFolder")
