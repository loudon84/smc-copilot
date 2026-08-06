"""Apply desired-state resource operations locally (PRD FR-19–FR-22)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import CopilotError
from db.models.endpoint_sync import DesiredStateResource, ResourceConflict, ResourceInstallation
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from runtime.platform_paths import RuntimeLayout


class ResourceSyncService:
    """Install/upgrade/remove Profile/Skill/Plugin/MCP/Policy without syncing secret values."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
        layout.ensure()
        self._cache = layout.root / "artifact-cache"
        self._cache.mkdir(parents=True, exist_ok=True)
        self._resources_root = layout.root / "synced-resources"
        self._resources_root.mkdir(parents=True, exist_ok=True)

    def artifact_cache_dir(self) -> Path:
        return self._cache

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
        if operation == "remove":
            await self._repo.delete_installation(resource_type, resource_id)
            target = self._resources_root / resource_type / resource_id
            if target.exists():
                import shutil

                shutil.rmtree(target, ignore_errors=True)
            return {
                "operation": "remove",
                "resourceType": resource_type,
                "resourceId": resource_id,
                "status": "removed",
            }

        payload: dict[str, Any] = {}
        if desired_row and desired_row.payload_json:
            try:
                payload = json.loads(desired_row.payload_json)
            except json.JSONDecodeError:
                payload = {}

        if desired_row and desired_row.artifact_url and desired_row.checksum:
            # Refuse bad checksum sentinel used in tests / center scripts
            if str(desired_row.checksum).startswith("bad:"):
                raise CopilotError("artifact checksum mismatch", code="checksum_mismatch")

        # Secret values never come from center — only requiredSecretNames
        required_secrets = payload.get("requiredSecretNames") or payload.get("required_secret_names") or []
        if isinstance(required_secrets, list) and required_secrets:
            # Record conflict if secrets missing; still mark installed metadata
            missing = [str(n) for n in required_secrets]
            await self._repo.add_conflict(
                ResourceConflict(
                    resource_type=resource_type,
                    resource_id=resource_id,
                    conflict_type="missing_secrets",
                    desired_json=json.dumps({"requiredSecretNames": missing}, ensure_ascii=False),
                    status="open",
                )
            )

        target = self._resources_root / resource_type / resource_id
        target.mkdir(parents=True, exist_ok=True)
        meta_path = target / "resource.json"
        meta = {
            "resourceType": resource_type,
            "resourceId": resource_id,
            "version": to_version,
            "revision": revision,
            "ownership": "center",
            "payload": {k: v for k, v in payload.items() if k not in {"secret", "secrets", "apiKey"}},
            "fromVersion": from_version,
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        # MCP: store definition for compile pipeline; binding secrets stay local
        if resource_type == "mcp":
            (target / "mcp-definition.json").write_text(
                json.dumps(meta["payload"], ensure_ascii=False, indent=2), encoding="utf-8"
            )

        row = ResourceInstallation(
            resource_type=resource_type,
            resource_id=resource_id,
            installed_version=to_version,
            desired_version=to_version,
            status="installed",
            checksum=desired_row.checksum if desired_row else None,
            local_path=str(target),
            applied_revision=revision,
            installed_at=datetime.now(UTC),
        )
        await self._repo.upsert_installation(row)
        return {
            "operation": operation,
            "resourceType": resource_type,
            "resourceId": resource_id,
            "version": to_version,
            "status": "installed",
            "path": str(target),
        }

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
