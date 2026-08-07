"""Resource adapter protocol and shared types (PRD FR-301)."""
# @lat: [[runtime-service#Resource Apply Adapters]]

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.hermes.cli_adapter import HermesCliAdapter
from runtime.resources.artifact_cache import ArtifactCache


@dataclass
class ResourceDesired:
    resource_type: str
    resource_id: str
    version: str | None
    operation: str  # install | upgrade | remove
    payload: dict[str, Any] = field(default_factory=dict)
    checksum: str | None = None
    artifact_url: str | None = None
    signature: str | None = None
    from_version: str | None = None
    revision: int = 0


@dataclass
class ResourceRollbackSnapshot:
    resource_type: str
    resource_id: str
    version: str | None
    local_path: str | None
    meta_json: str | None = None
    current_pointer_json: str | None = None
    commands_run: list[str] = field(default_factory=list)


@dataclass
class ApplyResult:
    status: str
    path: str | None = None
    restart_required: bool = False
    conflict_type: str | None = None
    message: str | None = None
    commands_run: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "status": self.status,
            "restartRequired": self.restart_required,
        }
        if self.path:
            out["path"] = self.path
        if self.conflict_type:
            out["conflictType"] = self.conflict_type
        if self.message:
            out["message"] = self.message
        if self.commands_run:
            out["commandsRun"] = list(self.commands_run)
        return out


@dataclass
class ResourceContext:
    settings: Settings
    session: AsyncSession
    repo: EndpointSyncRepository
    resources_root: Path
    staging_root: Path
    artifact_cache: ArtifactCache
    hermes_cli: HermesCliAdapter | None = None
    profile_name: str | None = None


class ResourceAdapter(Protocol):
    resource_type: str

    async def validate(self, ctx: ResourceContext, desired: ResourceDesired) -> list[str]: ...

    async def stage(self, ctx: ResourceContext, desired: ResourceDesired) -> Path: ...

    async def apply(self, ctx: ResourceContext, desired: ResourceDesired, staged: Path) -> ApplyResult: ...

    async def verify(self, ctx: ResourceContext, desired: ResourceDesired) -> dict[str, Any]: ...

    async def rollback(
        self,
        ctx: ResourceContext,
        desired: ResourceDesired,
        snapshot: ResourceRollbackSnapshot,
    ) -> None: ...

    async def remove(self, ctx: ResourceContext, desired: ResourceDesired) -> ApplyResult: ...
