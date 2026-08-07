from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PresetImportRequest(BaseModel):
    preset_yaml: str | None = None
    preset_version: str = "team_v1.4"
    overwrite: bool = False


class PortConflictItem(BaseModel):
    profile_name: str
    port: int
    used_by_profile_name: str


class PresetImportResponse(BaseModel):
    ok: bool
    imported_count: int = 0
    port_conflicts: list[PortConflictItem] = Field(default_factory=list)
    existing_without_overwrite: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class RoleLibrarySyncRequest(BaseModel):
    repo: str | None = None
    branch: str | None = "main"
    local_dir: str | None = "agency-agents-zh"


class RoleLibrarySyncResponse(BaseModel):
    ok: bool
    path: str
    commit: str | None = None
    error: str | None = None


class RoleSpecResponse(BaseModel):
    id: str
    profile_id: str
    role_key: str
    role_name: str
    source_repo: str
    source_paths_json: str
    soul_path: str | None
    memory_path: str | None
    source_checksum: str | None
    output_mode: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
