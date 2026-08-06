"""Apply desired-state resource operations via adapters (PRD FR-19–FR-22, FR-301–306)."""
# @lat: [[endpoint-sync#Desired State]]

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import CopilotError
from db.models.endpoint_sync import DesiredStateResource, ResourceInstallation
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from runtime.platform_paths import RuntimeLayout
from runtime.resources._common import capture_snapshot
from runtime.resources.base import ResourceDesired, ResourceRollbackSnapshot
from runtime.resources.registry import (
    build_adapter_registry,
    build_resource_context,
    cleanup_staging,
    get_adapter,
)


class ResourceSyncService:
    """Install/upgrade/remove resources through typed adapters with real staging/apply."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._repo = EndpointSyncRepository(session)
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._cache = layout.root / "artifact-cache"
        self._cache.mkdir(parents=True, exist_ok=True)
        self._resources_root = layout.root / "synced-resources"
        self._resources_root.mkdir(parents=True, exist_ok=True)
        self._adapters = build_adapter_registry()

    def artifact_cache_dir(self) -> Path:
        return self._cache

    def _build_desired(
        self,
        *,
        operation: str,
        resource_type: str,
        resource_id: str,
        from_version: str | None,
        to_version: str | None,
        revision: int,
        desired_row: DesiredStateResource | None,
    ) -> ResourceDesired:
        payload: dict[str, Any] = {}
        if desired_row and desired_row.payload_json:
            try:
                payload = json.loads(desired_row.payload_json)
            except json.JSONDecodeError:
                payload = {}
        return ResourceDesired(
            resource_type=resource_type,
            resource_id=resource_id,
            version=to_version,
            operation=operation,
            payload=payload if isinstance(payload, dict) else {},
            checksum=desired_row.checksum if desired_row else None,
            artifact_url=desired_row.artifact_url if desired_row else None,
            signature=desired_row.signature if desired_row else None,
            from_version=from_version,
            revision=revision,
        )

    async def capture_rollback_snapshot(
        self, resource_type: str, resource_id: str, from_version: str | None
    ) -> ResourceRollbackSnapshot:
        ctx = await build_resource_context(self._settings, self._session)
        return capture_snapshot(ctx, resource_type, resource_id, from_version)

    async def rollback_snapshot(self, snapshot: ResourceRollbackSnapshot) -> None:
        adapter = get_adapter(self._adapters, snapshot.resource_type)
        if adapter is None:
            return
        ctx = await build_resource_context(self._settings, self._session)
        desired = ResourceDesired(
            resource_type=snapshot.resource_type,
            resource_id=snapshot.resource_id,
            version=snapshot.version,
            operation="rollback",
        )
        await adapter.rollback(ctx, desired, snapshot)
        if not snapshot.meta_json and not snapshot.current_pointer_json:
            await self._repo.delete_installation(snapshot.resource_type, snapshot.resource_id)
        elif snapshot.version:
            row = await self._repo.get_installation(snapshot.resource_type, snapshot.resource_id)
            if row is not None:
                row.installed_version = snapshot.version
                row.status = "installed"
                row.local_path = snapshot.local_path
                await self._session.flush()

    async def apply_operation(
        self,
        *,
        operation: str,
        resource_type: str,
        resource_id: str,
        from_version: str | None,
        to_version: str | None,
        revision: int,
        desired_row: DesiredStateResource | None,
    ) -> dict[str, Any]:
        adapter = get_adapter(self._adapters, resource_type)
        if adapter is None:
            raise CopilotError(f"unsupported resource type: {resource_type}", code="unsupported_resource")

        ctx = await build_resource_context(self._settings, self._session)
        desired = self._build_desired(
            operation=operation,
            resource_type=resource_type,
            resource_id=resource_id,
            from_version=from_version,
            to_version=to_version,
            revision=revision,
            desired_row=desired_row,
        )

        if operation == "remove":
            result = await adapter.remove(ctx, desired)
            await self._repo.delete_installation(resource_type, resource_id)
            return {
                "operation": "remove",
                "resourceType": resource_type,
                "resourceId": resource_id,
                "status": result.status,
            }

        errors = await adapter.validate(ctx, desired)
        if errors:
            raise CopilotError("; ".join(errors), code="validation_error")

        staged = await adapter.stage(ctx, desired)
        try:
            result = await adapter.apply(ctx, desired, staged)
        finally:
            cleanup_staging(ctx, staged)

        if result.status in {"failed", "blocked"}:
            raise CopilotError(
                result.message or result.status,
                code=result.conflict_type or "apply_failed",
            )

        row = ResourceInstallation(
            resource_type=resource_type,
            resource_id=resource_id,
            installed_version=to_version,
            desired_version=to_version,
            status=result.status,
            checksum=desired_row.checksum if desired_row else None,
            local_path=result.path,
            applied_revision=revision,
            installed_at=datetime.now(UTC),
        )
        await self._repo.upsert_installation(row)

        return {
            "operation": operation,
            "resourceType": resource_type,
            "resourceId": resource_id,
            "version": to_version,
            "status": result.status,
            "path": result.path,
            "restartRequired": result.restart_required,
            "commandsRun": result.commands_run,
        }

    async def probe_resource(self, resource_type: str, resource_id: str) -> dict[str, Any]:
        adapter = get_adapter(self._adapters, resource_type)
        if adapter is None:
            raise CopilotError(f"unsupported resource type: {resource_type}", code="unsupported_resource")
        ctx = await build_resource_context(self._settings, self._session)
        installation = await self._repo.get_installation(resource_type, resource_id)
        desired = ResourceDesired(
            resource_type=resource_type,
            resource_id=resource_id,
            version=installation.installed_version if installation else None,
            operation="probe",
        )
        probe = await adapter.verify(ctx, desired)
        if installation:
            probe["dbStatus"] = installation.status
            probe["dbVersion"] = installation.installed_version
        return probe

    async def list_resources(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_installations()
        return [
            {
                "resourceType": r.resource_type,
                "resourceId": r.resource_id,
                "version": r.installed_version,
                "status": r.status,
                "appliedRevision": r.applied_revision,
            }
            for r in rows
        ]

    async def list_conflicts(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_conflicts(open_only=True)
        return [
            {
                "id": c.id,
                "resourceType": c.resource_type,
                "resourceId": c.resource_id,
                "type": c.conflict_type,
                "status": c.status,
            }
            for c in rows
        ]

    async def resolve_conflict(self, conflict_id: str, resolution: str) -> dict[str, Any]:
        row = await self._repo.get_conflict(conflict_id)
        if row is None:
            raise CopilotError("conflict not found", code="not_found")
        row.status = "resolved"
        row.resolution = resolution
        row.resolved_at = datetime.now(UTC)
        return {"id": row.id, "status": row.status, "resolution": resolution}
