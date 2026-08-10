"""Pydantic schemas for Session File API (PRD v1.6 FR-12/FR-13/FR-14)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SessionFileRole = Literal["prompt_attachment", "context_file", "agent_output", "artifact"]


class SessionFileItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    session_id: str = Field(alias="sessionId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    name: str
    role: SessionFileRole = "prompt_attachment"
    mime_type: str | None = Field(default=None, alias="mimeType")
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    storage_path: str | None = Field(default=None, alias="storagePath")
    workspace_relative_path: str | None = Field(default=None, alias="workspaceRelativePath")
    text_preview: str | None = Field(default=None, alias="textPreview")
    is_context: bool = Field(default=False, alias="isContext")
    created_at: str | None = Field(default=None, alias="createdAt")


class SessionFilesResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    files: list[SessionFileItem] = Field(default_factory=list)


class SessionFileSearchHit(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    name: str
    role: SessionFileRole = "prompt_attachment"
    snippet: str | None = None
    score: float = 0.0


class SessionFileSearchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hits: list[SessionFileSearchHit] = Field(default_factory=list)


class SessionFileContextResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    file_id: str = Field(alias="fileId")
    is_context: bool = Field(alias="isContext")
