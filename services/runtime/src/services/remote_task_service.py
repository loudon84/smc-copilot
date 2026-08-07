"""Remote Task Assignment v2 — delegates to WorkTask execution (PRD FR-23–FR-29, v1.6 M4)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import RemoteAssignmentStatus
from core.errors import ConflictError, CopilotError, NotFoundError
from db.models.endpoint_sync import RemoteTaskAssignment, TaskDeliveryRecord
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.experience_redactor import redact_payload
from services.endpoint_enrollment_service import EndpointEnrollmentService
from services.gateway_supervisor import GatewaySupervisor
from services.work_task_service import WorkTaskService


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# @lat: [[endpoint-sync#Remote Task v2]]
class RemoteTaskService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        supervisor: GatewaySupervisor | None = None,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._enrollment = EndpointEnrollmentService(settings, session, center)
        self._session = session
        self._work_tasks = WorkTaskRepository(session)
        self._supervisor = supervisor

    def _work_service(self) -> WorkTaskService:
        if self._supervisor is None:
            raise CopilotError("gateway supervisor required", code="supervisor_missing")
        return WorkTaskService(self._settings, self._session, self._center, self._supervisor)

    def _to_dict(self, row: RemoteTaskAssignment) -> dict[str, Any]:
        return {
            "id": row.id,
            "taskId": row.task_id,
            "assignmentId": row.assignment_id,
            "assignmentVersion": row.assignment_version,
            "taskType": row.task_type,
            "title": row.title,
            "status": row.status,
            "leaseSeconds": row.lease_seconds,
            "blockReason": row.block_reason,
            "localTaskId": row.local_task_id,
            "workTaskId": row.work_task_id,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
        }

    async def ingest_assignment(self, payload: dict[str, Any]) -> RemoteTaskAssignment:
        assignment_id = str(payload.get("assignmentId") or "")
        version = int(payload.get("assignmentVersion") or 1)
        if not assignment_id:
            raise CopilotError("assignmentId required", code="invalid_assignment")

        existing = await self._repo.get_assignment_by_version(assignment_id, version)
        if existing is not None:
            return existing

        row = RemoteTaskAssignment(
            task_id=str(payload.get("taskId") or assignment_id),
            assignment_id=assignment_id,
            assignment_version=version,
            task_type=str(payload.get("taskType") or "coding_task"),
            title=str(payload.get("title") or assignment_id),
            instructions=payload.get("instructions"),
            status=RemoteAssignmentStatus.RECEIVED.value,
            profile_ref_json=json.dumps(payload.get("profileRef") or {}, ensure_ascii=False),
            payload_json=json.dumps(payload, ensure_ascii=False),
            policies_json=json.dumps(
                {
                    "approvalPolicy": payload.get("approvalPolicy"),
                    "workspacePolicy": payload.get("workspacePolicy"),
                    "toolPolicy": payload.get("toolPolicy"),
                    "dataPolicy": payload.get("dataPolicy"),
                },
                ensure_ascii=False,
            ),
            lease_seconds=int(payload.get("leaseSeconds") or 300),
            deadline=_parse_dt(payload.get("deadline")),
        )
        await self._repo.add_assignment(row)
        row.status = RemoteAssignmentStatus.READY.value
        return row

    async def apply_control(self, payload: dict[str, Any]) -> None:
        assignment_id = str(payload.get("assignmentId") or "")
        action = str(payload.get("action") or "").lower()
        row = await self._repo.get_assignment_by_assignment_id(assignment_id)
        if row is None:
            return
        if action == "cancel":
            if row.work_task_id:
                await self._work_service().cancel(row.work_task_id)
            else:
                row.status = RemoteAssignmentStatus.CANCELLED.value
                lease = await self._repo.get_active_lease(assignment_id)
                if lease:
                    lease.status = "cancelled"
        elif action == "pause":
            row.block_reason = "paused_by_center"
        elif action == "resume":
            row.block_reason = None

    async def list_assignments(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_assignments()
        return [self._to_dict(r) for r in rows]

    async def get_assignment(self, row_id: str) -> dict[str, Any]:
        row = await self._repo.get_assignment_row(row_id)
        if row is None:
            row = await self._repo.get_assignment_by_assignment_id(row_id)
        if row is None:
            raise NotFoundError("assignment not found")
        return self._to_dict(row)

    async def accept(self, row_id: str) -> dict[str, Any]:
        row = await self._repo.get_assignment_row(row_id) or await self._repo.get_assignment_by_assignment_id(row_id)
        if row is None:
            raise NotFoundError("assignment not found")
        if row.status in {
            RemoteAssignmentStatus.CANCELLED.value,
            RemoteAssignmentStatus.REJECTED.value,
            RemoteAssignmentStatus.DELIVERED.value,
        }:
            raise ConflictError(f"cannot accept assignment in status {row.status}")

        work_svc = self._work_service()
        task = await work_svc.create_from_assignment(row, claim=True)
        await work_svc.start(task.id)
        await self._session.flush()
        refreshed = await self._repo.get_assignment_by_assignment_id(row.assignment_id)
        if refreshed is not None:
            row = refreshed
        return self._to_dict(row)

    async def reject(self, row_id: str, *, reason: str | None = None) -> dict[str, Any]:
        row = await self._repo.get_assignment_row(row_id) or await self._repo.get_assignment_by_assignment_id(row_id)
        if row is None:
            raise NotFoundError("assignment not found")
        row.status = RemoteAssignmentStatus.REJECTED.value
        row.block_reason = reason
        return self._to_dict(row)

    async def cancel(self, row_id: str) -> dict[str, Any]:
        row = await self._repo.get_assignment_row(row_id) or await self._repo.get_assignment_by_assignment_id(row_id)
        if row is None:
            raise NotFoundError("assignment not found")
        if row.work_task_id:
            await self._work_service().cancel(row.work_task_id)
        else:
            row.status = RemoteAssignmentStatus.CANCELLED.value
            lease = await self._repo.get_active_lease(row.assignment_id)
            if lease:
                lease.status = "cancelled"
            await self._record_legacy_event(row.assignment_id, "task.cancelled", {"assignmentId": row.assignment_id})
        row = await self._repo.get_assignment_row(row.id) or row
        return self._to_dict(row)

    async def list_events(self, row_id: str) -> list[dict[str, Any]]:
        row = await self._repo.get_assignment_row(row_id) or await self._repo.get_assignment_by_assignment_id(row_id)
        if row is None:
            raise NotFoundError("assignment not found")

        if row.work_task_id:
            events = await self._work_tasks.list_events(row.work_task_id)
            return [
                {
                    "eventId": str(e.sequence),
                    "eventType": e.event_type,
                    "status": "persisted",
                    "payload": json.loads(e.payload_json or "{}"),
                    "createdAt": e.created_at.isoformat() if e.created_at else None,
                }
                for e in events
            ]

        records = await self._repo.list_delivery_records(row.assignment_id)
        return [
            {
                "eventId": r.event_id,
                "eventType": r.event_type,
                "status": r.status,
                "payload": json.loads(r.payload_json),
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]

    async def process_ready_assignments(self, *, limit: int = 5) -> int:
        """Worker entry: auto-claim READY assignments when sync enabled."""
        try:
            await self._enrollment.ensure_access_token()
        except CopilotError:
            return 0
        count = 0
        work_svc = self._work_service()
        for row in await self._repo.list_assignments(limit=50):
            if row.status != RemoteAssignmentStatus.READY.value:
                continue
            if count >= limit:
                break
            task = await work_svc.create_from_assignment(row, claim=True)
            row.status = RemoteAssignmentStatus.RUNNING.value
            await work_svc.start(task.id)
            count += 1
        return count

    async def _record_legacy_event(self, assignment_id: str, event_type: str, payload: dict[str, Any]) -> None:
        from uuid import uuid4

        await self._repo.add_delivery_record(
            TaskDeliveryRecord(
                assignment_id=assignment_id,
                event_id=str(uuid4()),
                event_type=event_type,
                payload_json=json.dumps(redact_payload(payload), ensure_ascii=False),
                status="pending",
            )
        )
