"""Desired state ingest, plan, and apply with revision-level rollback (PRD FR-15–FR-18, FR-307–308)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.errors import ConflictError, NotFoundError
from db.models.endpoint_sync import (
    DesiredStateResource,
    DesiredStateRevision,
    ResourceApplyOperation,
    ResourceApplyRun,
    ResourceSnapshot,
)
from db.models.runtime import HermesInstance
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.desired_state_reconciler import (
    InstalledResource,
    ReconciliationPlan,
    build_reconciliation_plan,
    parse_desired_resource,
)
from runtime.resources.base import ResourceRollbackSnapshot
from services.configuration_service import ConfigurationService
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
        self._session = session

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
        installed = [InstalledResource(i.resource_type, i.resource_id, i.installed_version) for i in installations]
        removed = payload.get("removedResources")
        return build_reconciliation_plan(
            revision=rev_row.revision,
            desired=desired,
            installed=installed,
            removed_resources=removed if isinstance(removed, list) else None,
        )

    async def _snapshot_instance_configs(self) -> list[str]:
        config_svc = ConfigurationService(self._settings, self._session)
        snap_ids: list[str] = []
        result = await self._session.execute(select(HermesInstance))
        for inst in result.scalars().all():
            snap = await config_svc.create_snapshot(inst.id, reason="resource_apply")
            snap_ids.append(snap.id)
        return snap_ids

    async def _restore_instance_configs(self) -> None:
        config_svc = ConfigurationService(self._settings, self._session)
        result = await self._session.execute(select(HermesInstance))
        for inst in result.scalars().all():
            await config_svc.restore_latest_snapshot(inst.id)

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
        config_snap_ids = await self._snapshot_instance_configs()

        run = ResourceApplyRun(
            revision=rev_row.revision,
            revision_id=rev_row.id,
            status="running",
            config_snapshot_ids_json=json.dumps(config_snap_ids),
        )
        self._session.add(run)
        await self._session.flush()

        applied_ops: list[dict[str, Any]] = []
        completed: list[tuple[ResourceApplyOperation, ResourceRollbackSnapshot]] = []

        try:
            for seq, op in enumerate(plan.operations):
                pre_snapshot = await self._resources.capture_rollback_snapshot(
                    op.resource_type, op.resource_id, op.from_version
                )
                snap_row = ResourceSnapshot(
                    run_id=run.id,
                    resource_type=op.resource_type,
                    resource_id=op.resource_id,
                    version=pre_snapshot.version,
                    local_path=pre_snapshot.local_path,
                    meta_json=pre_snapshot.meta_json,
                    pointer_json=pre_snapshot.current_pointer_json,
                )
                self._session.add(snap_row)
                await self._session.flush()

                op_row = ResourceApplyOperation(
                    run_id=run.id,
                    operation=op.operation,
                    resource_type=op.resource_type,
                    resource_id=op.resource_id,
                    from_version=op.from_version,
                    to_version=op.to_version,
                    status="running",
                    snapshot_id=snap_row.id,
                    sequence=seq,
                )
                self._session.add(op_row)
                await self._session.flush()

                result = await self._resources.apply_operation(
                    operation=op.operation,
                    resource_type=op.resource_type,
                    resource_id=op.resource_id,
                    from_version=op.from_version,
                    to_version=op.to_version,
                    revision=rev_row.revision,
                    desired_row=await self._find_desired(rev_row.id, op.resource_type, op.resource_id),
                )
                op_row.status = "completed"
                op_row.result_json = json.dumps(result, ensure_ascii=False)
                op_row.completed_at = datetime.now(UTC)
                applied_ops.append(result)
                completed.append((op_row, pre_snapshot))

            rev_row.status = "applied"
            rev_row.applied_at = datetime.now(UTC)
            rev_row.last_error = None
            run.status = "applied"
            run.completed_at = datetime.now(UTC)

        except Exception as exc:
            for op_row, snapshot in reversed(completed):
                try:
                    await self._resources.rollback_snapshot(snapshot)
                    op_row.status = "rolled_back"
                except Exception:
                    op_row.status = "rollback_failed"
                op_row.completed_at = datetime.now(UTC)

            await self._restore_instance_configs()
            rev_row.status = "rolled_back"
            rev_row.last_error = str(exc)[:500]
            run.status = "rolled_back"
            run.last_error = str(exc)[:500]
            run.completed_at = datetime.now(UTC)
            raise ConflictError(f"desired state apply failed: {exc}") from exc

        return {
            "revision": rev_row.revision,
            "status": rev_row.status,
            "plan": plan.to_dict(),
            "applied": applied_ops,
            "runId": run.id,
        }

    async def rollback_revision(self, revision: int) -> dict[str, Any]:
        rev_row = await self._repo.get_revision_by_number(revision)
        if rev_row is None:
            raise NotFoundError("desired state revision not found")

        result = await self._session.execute(
            select(ResourceApplyRun)
            .where(ResourceApplyRun.revision == revision)
            .order_by(ResourceApplyRun.created_at.desc())
            .limit(1)
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise NotFoundError("resource apply run not found")

        ops_result = await self._session.execute(
            select(ResourceApplyOperation)
            .where(ResourceApplyOperation.run_id == run.id, ResourceApplyOperation.status == "completed")
            .order_by(ResourceApplyOperation.sequence.desc())
        )
        ops = list(ops_result.scalars().all())

        rolled: list[str] = []
        for op_row in ops:
            snap_result = await self._session.execute(
                select(ResourceSnapshot).where(ResourceSnapshot.id == op_row.snapshot_id)
            )
            snap = snap_result.scalar_one_or_none()
            if snap is None:
                continue
            snapshot = ResourceRollbackSnapshot(
                resource_type=snap.resource_type,
                resource_id=snap.resource_id,
                version=snap.version,
                local_path=snap.local_path,
                meta_json=snap.meta_json,
                current_pointer_json=snap.pointer_json,
            )
            await self._resources.rollback_snapshot(snapshot)
            op_row.status = "rolled_back"
            rolled.append(f"{snap.resource_type}/{snap.resource_id}")

        await self._restore_instance_configs()
        rev_row.status = "rolled_back"
        run.status = "rolled_back"
        run.completed_at = datetime.now(UTC)
        return {"revision": revision, "status": "rolled_back", "rolledBack": rolled}

    async def list_reconciliations(self, *, limit: int = 50) -> list[dict[str, Any]]:
        result = await self._session.execute(
            select(ResourceApplyRun).order_by(ResourceApplyRun.created_at.desc()).limit(limit)
        )
        runs = list(result.scalars().all())
        out: list[dict[str, Any]] = []
        for run in runs:
            rev = await self._repo.get_revision_by_number(run.revision)
            out.append(
                {
                    "runId": run.id,
                    "revision": run.revision,
                    "status": run.status,
                    "revisionStatus": rev.status if rev else None,
                    "startedAt": run.started_at.isoformat() if run.started_at else None,
                    "completedAt": run.completed_at.isoformat() if run.completed_at else None,
                    "lastError": run.last_error,
                }
            )
        return out

    async def get_reconciliation(self, revision: int) -> dict[str, Any]:
        result = await self._session.execute(
            select(ResourceApplyRun)
            .where(ResourceApplyRun.revision == revision)
            .order_by(ResourceApplyRun.created_at.desc())
            .limit(1)
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise NotFoundError("reconciliation not found")

        ops_result = await self._session.execute(
            select(ResourceApplyOperation)
            .where(ResourceApplyOperation.run_id == run.id)
            .order_by(ResourceApplyOperation.sequence)
        )
        ops = list(ops_result.scalars().all())
        rev_row = await self._repo.get_revision_by_number(revision)
        plan = await self.build_plan(revision) if rev_row else None

        return {
            "runId": run.id,
            "revision": run.revision,
            "status": run.status,
            "revisionStatus": rev_row.status if rev_row else None,
            "plan": plan.to_dict() if plan else None,
            "operations": [
                {
                    "id": o.id,
                    "operation": o.operation,
                    "resourceType": o.resource_type,
                    "resourceId": o.resource_id,
                    "fromVersion": o.from_version,
                    "toVersion": o.to_version,
                    "status": o.status,
                    "error": o.error,
                    "result": json.loads(o.result_json) if o.result_json else None,
                }
                for o in ops
            ],
            "lastError": run.last_error,
        }

    async def actual_state(self) -> dict[str, Any]:
        latest = await self._repo.get_latest_revision()
        applied = None
        if latest and latest.status == "applied":
            applied = latest.revision
        elif latest:
            installations = await self._repo.list_installations()
            applied = max((i.applied_revision or 0 for i in installations), default=0) or None
        installations = await self._repo.list_installations()
        conflicts = await self._repo.list_conflicts(open_only=True)
        status = "healthy"
        if latest and latest.status in {"failed", "rolled_back"}:
            status = "degraded"
        elif latest and applied is not None and latest.revision != applied:
            status = "pending"

        probed_resources: list[dict[str, Any]] = []
        for inst in installations:
            try:
                probe = await self._resources.probe_resource(inst.resource_type, inst.resource_id)
                probed_resources.append(
                    {
                        "resourceType": inst.resource_type,
                        "resourceId": inst.resource_id,
                        "version": probe.get("installedVersion") or inst.installed_version,
                        "status": inst.status if not probe.get("blocked") else "blocked",
                        "probe": probe,
                    }
                )
            except Exception as exc:
                probed_resources.append(
                    {
                        "resourceType": inst.resource_type,
                        "resourceId": inst.resource_id,
                        "version": inst.installed_version,
                        "status": inst.status,
                        "probeError": str(exc)[:200],
                    }
                )

        return {
            "desiredRevision": latest.revision if latest else None,
            "appliedRevision": applied,
            "status": status,
            "resources": probed_resources,
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
