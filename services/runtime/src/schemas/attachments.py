from __future__ import annotations

from pydantic import BaseModel, Field


class ChatAttachmentResponse(BaseModel):
    id: str
    profile_id: str
    workspace_id: str
    session_id: str
    name: str
    mime_type: str
    size_bytes: int
    sha256: str
    workspace_relative_path: str
    text_preview: str | None = None


class UploadAttachmentsResponse(BaseModel):
    attachments: list[ChatAttachmentResponse] = Field(default_factory=list)


class RemoveAttachmentResponse(BaseModel):
    ok: bool = True
