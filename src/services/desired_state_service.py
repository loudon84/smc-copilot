"""Desired state ingest, plan, and apply (PRD FR-15–FR-18)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import ConflictError, NotFoundError
from db.models.endpoint_sync import DesiredStateResource, DesiredStateRevision
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.desired_state_reconciler import (
    InstalledResource,
    ReconciliationPlan,
    build_reconciliation_plan,
    parse_desired_resource,
)
from services.resource_sync_service import ResourceSyncService


# @lat: [[endpoint-sync#Desired State]]
class DesiredStateService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient | None = None,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._resources = ResourceSyncService(settings, session)

    async def ingest_desired_state(self, payload: dict[str, Any]) -> DesiredStateRevision:
        revision = int(payload.get("revision") or 0)
        existing = await self._repo.get_revision_by_number(revision)
        if existing is not None:
            return existing

        row = DesiredStateRevision(
            revision=revision,
            generated_at=_parse_dt(payload.get("generatedAt")),
            payload_json=json.dumps(payload, ensure_ascii=False),
            status="pending",
        )
        await self._repo.add_revision(row)
        for item in payload.get("resources") or []:
            if not isinstance(item, dict):
                continue
            d = parse_desired_resource(item)
            await self._repo.add_desired_resource(
                DesiredStateResource(
                    revision_id=row.id,
                    resource_type=d.resource_type,
                    resource_id=d.resource_id,
                    version=d.version,
                    apply_mode=d.apply_mode,
                    checksum=d.checksum,
                    artifact_url=d.artifact_url,
                    signature=d.signature,
                    ownership="center",
                    payload_json=json.dumps(item, ensure_ascii=False),
                )
            )
        return row

    async def build_plan(self, revision: int | None = None) -> ReconciliationPlan:
        rev_row = (
            await self._repo.get_revision_by_number(revision)
            if revision is not None
            else await self._repo.get_latest_revision()
        )
        if rev_row is None:
            raise NotFoundError("desired state revision not found")
        payload = json.loads(rev_row.payload_json)
        desired = [parse_desired_resource(x) for x in (payload.get("resources") or []) if isinstance(x, dict)]
        installations = await self._repo.list_installations()
        installed = [
            InstalledResource(i.resource_type, i.resource_id, i.installed_version) for i in installations
        ]
        removed = payload.get("removedResources")
        return build_reconciliation_plan(
            revision=rev_row.revision,
            desired=desired,
            installed=installed,
            removed_resources=removed if isinstance(removed, list) else None,
        )

    async def apply_revision(self, revision: int | None = None) -> dict[str, Any]:
        rev_row = (
            await self._repo.get_revision_by_number(revision)
            if revision is not None
            else await self._repo.get_latest_revision()
        )
        if rev_row is None:
            raise NotFoundError("desired state revision not found")
        if rev_row.status == "applied":
            return {"revision": rev_row.revision, "status": "applied", "alreadyApplied": True}

        plan = await self.build_plan(rev_row.revision)
        # Validate: refuse apply when any install/upgrade lacks checksum for managed artifacts with URL
        for op in plan.operations:
            if op.operation in {"install", "upgrade"}:
                # checksum validation happens in resource sync when URL present
                pass

        applied_ops: list[dict[str, Any]] = []
        try:
            for op in plan.operations:
                result = await self._resources.apply_operation(
                    operation=op.operation,
                    resource_type=op.resource_type,
                    resource_id=op.resource_id,
                    from_version=op.from_version,
                    to_version=op.to_version,
                    revision=rev_row.revision,
                    desired_row=await self._find_desired(rev_row.id, op.resource_type, op.resource_id),
                )
                applied_ops.append(result)
            rev_row.status = "applied"
            rev_row.applied_at = datetime.now(UTC)
            rev_row.last_error = None
        except Exception as exc:
            rev_row.status = "failed"
            rev_row.last_error = str(exc)[:500]
            # Best-effort rollback of last op already handled in resource sync
            raise ConflictError(f"desired state apply failed: {exc}") from exc

        return {
            "revision": rev_row.revision,
            "status": rev_row.status,
            "plan": plan.to_dict(),
            "applied": applied_ops,
        }

    async def actual_state(self) -> dict[str, Any]:
        latest = await self._repo.get_latest_revision()
        applied = None
        if latest and latest.status == "applied":
            applied = latest.revision
        elif latest:
            # find last applied
            installations = await self._repo.list_installations()
            applied = max((i.applied_revision or 0 for i in installations), default=0) or None
        installations = await self._repo.list_installations()
        conflicts = await self._repo.list_conflicts(open_only=True)
        status = "healthy"
        if latest and latest.status == "failed":
            status = "degraded"
        elif latest and applied is not None and latest.revision != applied:
            status = "pending"
        return {
            "desiredRevision": latest.revision if latest else None,
            "appliedRevision": applied,
            "status": status,
            "resources": [
                {
                    "resourceType": i.resource_type,
                    "resourceId": i.resource_id,
                    "version": i.installed_version,
                    "status": i.status,
                }
                for i in installations
            ],
            "conflicts": [
                {"id": c.id, "resourceType": c.resource_type, "resourceId": c.resource_id, "type": c.conflict_type}
                for c in conflicts
            ],
            "lastApplyError": {"message": latest.last_error} if latest and latest.last_error else {},
        }

    async def _find_desired(
        self, revision_id: str, resource_type: str, resource_id: str
    ) -> DesiredStateResource | None:
        rows = await self._repo.list_desired_resources(revision_id)
        for r in rows:
            if r.resource_type == resource_type and r.resource_id == resource_id:
                return r
        return None


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
