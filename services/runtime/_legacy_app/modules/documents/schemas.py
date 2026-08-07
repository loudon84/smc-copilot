from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DocumentType = Literal["spreadsheet"]
DocumentEngine = Literal["univer"]
DocumentStatus = Literal["draft", "active", "archived", "deleted"]
DocumentProvider = Literal["local", "wecom", "onlyoffice"]
DocumentPermissionRole = Literal["view", "edit", "owner"]
SaveMode = Literal["manual", "autosave", "system"]


class DocumentCreateRequest(BaseModel):
    title: str
    document_type: DocumentType = "spreadsheet"
    engine: DocumentEngine = "univer"


class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    status: DocumentStatus | None = None


class DocumentResponse(BaseModel):
    id: str
    title: str
    document_type: DocumentType
    engine: DocumentEngine
    status: DocumentStatus
    provider: DocumentProvider
    current_version_no: int
    owner_id: str
    current_user_permission: DocumentPermissionRole
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(BaseModel):
    page: int
    page_size: int
    total: int


class DocumentListResponse(PaginatedResponse):
    items: list[DocumentResponse]


class SnapshotSaveRequest(BaseModel):
    base_version_no: int = Field(ge=1)
    save_mode: SaveMode = "manual"
    engine_version: str
    schema_version: int = 1
    snapshot: dict[str, object]
    created_from: str | None = Field(default=None, description="manual_save | ai_patch_apply")
    related_interaction_id: str | None = None
    related_patch_id: str | None = None


class SnapshotEnvelope(BaseModel):
    document_id: str
    document_type: DocumentType
    engine: DocumentEngine
    engine_version: str
    schema_version: int
    version_no: int
    saved_at: datetime
    saved_by: str
    snapshot: dict[str, object]


class SnapshotSaveResponse(BaseModel):
    document_id: str
    version_no: int
    snapshot_size_bytes: int
    snapshot_checksum_sha256: str
    saved_at: datetime


class DocumentVersionResponse(BaseModel):
    id: str
    document_id: str
    version_no: int
    snapshot_bucket: str
    snapshot_key: str
    snapshot_size_bytes: int
    snapshot_checksum_sha256: str
    engine: DocumentEngine
    engine_version: str
    schema_version: int
    save_mode: SaveMode
    created_by: str
    created_at: datetime
    created_from: str | None = None
    related_interaction_id: str | None = None
    related_patch_id: str | None = None


class DocumentPermissionItem(BaseModel):
    subject_type: Literal["user", "role", "department"]
    subject_id: str
    role: DocumentPermissionRole


class DocumentPermissionsResponse(BaseModel):
    items: list[DocumentPermissionItem]


class DocumentPermissionsReplaceRequest(BaseModel):
    items: list[DocumentPermissionItem]


class DocumentEventResponse(BaseModel):
    id: str
    document_id: str
    event_type: str
    actor_id: str
    version_no: int | None = None
    payload: dict[str, object] | None = None
    created_at: datetime
