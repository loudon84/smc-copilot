"""Pydantic schemas for Chat Workspace / Worktree (PRD v1.6 FR-06/FR-07)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    path: str
    kind: Literal["file", "directory"] = "file"
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    modified_at: str | None = Field(default=None, alias="modifiedAt")


class WorkspaceListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    root: str
    path: str
    entries: list[WorkspaceEntry] = Field(default_factory=list)


class WorkspaceFileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    name: str
    content: str | None = None
    mime_type: str | None = Field(default=None, alias="mimeType")
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    truncated: bool = False


class WorkspaceTerminalPathResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    validated: bool = True
