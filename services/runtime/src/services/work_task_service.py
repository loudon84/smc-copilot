"""Work task orchestration (FR-401)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import RemoteAssignmentStatus, WorkTaskStatus
from core.errors import ConflictError, NotFoundError
from db.models.endpoint_sync import RemoteTaskAssignment, TaskLease
from db.models.work_tasks import WorkTask
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.tasks.executor import TaskExecutor
from runtime.tasks.registry import get_task_scheduler, get_test_hermes_adapter
from services.endpoint_enrollment_service import EndpointEnrollmentService
from services.gateway_supervisor import GatewaySupervisor


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# @lat: [[endpoint-sync#Work Task Execution#Work Task Service]]
class WorkTaskService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        supervisor: GatewaySupervisor,
    ) -> None:
        self._settings = settings
        self._session = session
        self._center = center
        self._supervisor = supervisor
        self._repo = WorkTaskRepository(session)
        self._sync = EndpointSyncRepository(session)
        self._enrollment = EndpointEnrollmentService(settings, session, center)

    def _executor(self) -> TaskExecutor:
        adapter = get_test_hermes_adapter()
        return TaskExecutor(
            self._settings,
            self._session,
            self._center,
            self._supervisor,
            adapter=adapter if adapter is not None else None,
            scheduler=get_task_scheduler(),
        )

    def _to_dict(self, row: WorkTask) -> dict[str, Any]:
        return {
            "id": row.id,
            "source": row.source,
            "sourceTaskId": row.source_task_id,
            "assignmentId": row.assignment_id,
            "title": row.title,
            "taskType": row.task_type,
            "priority": row.priority,
            "status": row.status,
            "profileId": row.profile_id,
            "instanceId": row.instance_id,
            "deadline": row.deadline.isoformat() if row.deadline else None,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            "completedAt": row.completed_at.isoformat() if row.completed_at else None,
        }

    async def list_tasks(self, limit: int = 200) -> list[dict[str, Any]]:
        return [self._to_dict(r) for r in await self._repo.list_tasks(limit=limit)]

    async def get_task(self, task_id: str) -> dict[str, Any]:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        return self._to_dict(row)

    async def create_from_assignment(
        self,
        assignment: RemoteTaskAssignment,
        *,
        claim: bool = True,
    ) -> WorkTask:
        existing = await self._repo.get_task_by_assignment(assignment.assignment_id)
        if existing is not None:
            return existing

        profile_ref = {}
        try:
            profile_ref = json.loads(assignment.profile_ref_json or "{}")
        except json.JSONDecodeError:
            profile_ref = {}
        policies = {}
        try:
            policies = json.loads(assignment.policies_json or "{}")
        except json.JSONDecodeError:
            policies = {}

        row = WorkTask(
            source="remote_assignment",
            source_task_id=assignment.task_id,
            assignment_id=assignment.assignment_id,
            title=assignment.title,
            task_type=assignment.task_type,
            priority=0,
            status=WorkTaskStatus.READY.value,
            profile_id=str(profile_ref.get("resourceId") or profile_ref.get("profileId") or ""),
            instructions=assignment.instructions,
            approval_policy_json=json.dumps(policies.get("approvalPolicy") or {}, ensure_ascii=False),
            workspace_policy_json=json.dumps(policies.get("workspacePolicy") or {}, ensure_ascii=False),
            tool_policy_json=json.dumps(policies.get("toolPolicy") or {}, ensure_ascii=False),
            data_policy_json=json.dumps(policies.get("dataPolicy") or {}, ensure_ascii=False),
            payload_json=assignment.payload_json,
            deadline=assignment.deadline,
        )
        await self._repo.add_task(row)
        assignment.work_task_id = row.id
        assignment.local_task_id = row.id

        if claim:
            await self._claim_assignment(assignment, row)

        return row

    async def _claim_assignment(self, assignment: RemoteTaskAssignment, task: WorkTask) -> None:
        cred = await self._enrollment.ensure_access_token()
        assignment.status = RemoteAssignmentStatus.CLAIMING.value
        task.status = WorkTaskStatus.CLAIMING.value
        lease_resp = await self._center.claim(assignment.assignment_id, endpoint_id=cred.endpoint_id)
        expires = _parse_dt(lease_resp.expires_at) or (
            datetime.now(UTC) + timedelta(seconds=assignment.lease_seconds)
        )
        lease = TaskLease(
            assignment_row_id=assignment.id,
            assignment_id=assignment.assignment_id,
            lease_id=lease_resp.lease_id,
            expires_at=expires,
            heartbeat_interval_seconds=lease_resp.heartbeat_interval_seconds,
            status="active",
            work_task_id=task.id,
        )
        await self._sync.add_lease(lease)
        assignment.status = RemoteAssignmentStatus.CLAIMED.value
        task.status = WorkTaskStatus.QUEUED.value
        await self._session.flush()

    async def _load_task_dict(self, task_id: str) -> dict[str, Any]:
        result = await self._session.execute(
            select(
                WorkTask.id,
                WorkTask.source,
                WorkTask.source_task_id,
                WorkTask.assignment_id,
                WorkTask.title,
                WorkTask.task_type,
                WorkTask.priority,
                WorkTask.status,
                WorkTask.profile_id,
                WorkTask.instance_id,
                WorkTask.deadline,
                WorkTask.created_at,
                WorkTask.updated_at,
                WorkTask.completed_at,
            ).where(WorkTask.id == task_id)
        )
        row = result.one_or_none()
        if row is None:
            raise NotFoundError("work task not found")
        return {
            "id": row.id,
            "source": row.source,
            "sourceTaskId": row.source_task_id,
            "assignmentId": row.assignment_id,
            "title": row.title,
            "taskType": row.task_type,
            "priority": row.priority,
            "status": row.status,
            "profileId": row.profile_id,
            "instanceId": row.instance_id,
            "deadline": row.deadline.isoformat() if row.deadline else None,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            "completedAt": row.completed_at.isoformat() if row.completed_at else None,
        }

    async def start(self, task_id: str) -> dict[str, Any]:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        if row.status == WorkTaskStatus.MIGRATION_PENDING_REVIEW.value:
            raise ConflictError("task requires migration review")
        executor = self._executor()
        await executor.schedule(row.id, priority=row.priority)
        await self._session.flush()
        return await self._load_task_dict(task_id)

    async def cancel(self, task_id: str) -> dict[str, Any]:
        row = await self._executor().cancel(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        await self._session.flush()
        return await self._load_task_dict(task_id)

    async def retry(self, task_id: str) -> dict[str, Any]:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        row.status = WorkTaskStatus.QUEUED.value
        return await self.start(task_id)
