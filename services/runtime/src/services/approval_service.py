from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import ApprovalStatus, TaskStatus
from core.errors import ConflictError, NotFoundError
from db.models.task_related import Approval, TaskEvent
from db.repositories.v12_repos import ApprovalRepository, AuditRepository, TaskEventRepository, TaskRepository
from services.task_state_machine import assert_transition_allowed
from services.task_sync_service import TaskSyncService


# @lat: [[approval-workspace#审批运行时]]
class ApprovalService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings
        self._approvals = ApprovalRepository(session)
        self._tasks = TaskRepository(session)
        self._audit = AuditRepository(session)
        self._sync = TaskSyncService(session)

    async def request_approval(
        self,
        task_id: str,
        *,
        action_type: str,
        action_payload: dict | None = None,
        risk_level: str = "medium",
        requested_by: str | None = None,
    ) -> Approval:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        row = Approval(
            task_id=task_id,
            action_type=action_type,
            action_payload=json.dumps(action_payload) if action_payload else None,
            risk_level=risk_level,
            status=ApprovalStatus.PENDING.value,
            requested_by=requested_by,
        )
        r = await self._approvals.create(row)
        await TaskEventRepository(self._session).create(
            TaskEvent(
                task_id=task_id,
                event_type="approval_requested",
                message=r.id,
                event_payload=json.dumps(
                    {
                        "approval_id": r.id,
                        "action_type": action_type,
                        "risk_level": risk_level,
                        "status": r.status,
                    },
                    default=str,
                ),
            )
        )
        await self._audit.log(
            action="approval_requested", actor=requested_by, task_id=task_id, payload={"approval_id": r.id}
        )
        return r

    async def approve(self, approval_id: str, *, approved_by: str | None) -> Approval:
        row = await self._approvals.get(approval_id)
        if row is None:
            raise NotFoundError("Approval not found")
        if row.status != ApprovalStatus.PENDING.value:
            raise ConflictError("Approval is not pending")
        row.status = ApprovalStatus.APPROVED.value
        row.approved_by = approved_by
        row.decided_at = datetime.now(UTC)
        await self._approvals.save(row)
        await self._audit.log(
            action="approval_approved", actor=approved_by, task_id=row.task_id, payload={"approval_id": approval_id}
        )
        task = await self._tasks.get(row.task_id)
        if task and task.status == TaskStatus.WAITING_APPROVAL.value:
            assert_transition_allowed(task.status, TaskStatus.APPROVED.value)
            task.status = TaskStatus.APPROVED.value
            await self._tasks.save(task)
            await self._sync.enqueue(
                target_type="local_task",
                target_id=task.id,
                event_type="task_approved",
                payload={"task_id": task.id, "approval_id": approval_id},
            )
        return row

    async def reject(self, approval_id: str, *, actor: str | None, reason: str | None) -> Approval:
        row = await self._approvals.get(approval_id)
        if row is None:
            raise NotFoundError("Approval not found")
        if row.status != ApprovalStatus.PENDING.value:
            raise ConflictError("Approval is not pending")
        row.status = ApprovalStatus.REJECTED.value
        row.reject_reason = reason
        row.decided_at = datetime.now(UTC)
        await self._approvals.save(row)
        await self._audit.log(
            action="approval_rejected",
            actor=actor,
            task_id=row.task_id,
            payload={"approval_id": approval_id, "reason": reason},
        )
        task = await self._tasks.get(row.task_id)
        if task and task.status == TaskStatus.WAITING_APPROVAL.value:
            target = (
                TaskStatus.CANCELLED.value if self._settings.task_reject_sets_cancelled else TaskStatus.FAILED.value
            )
            assert_transition_allowed(task.status, target)
            task.status = target
            if target == TaskStatus.FAILED.value:
                task.error_message = reason or "Rejected by reviewer"
            task.finished_at = datetime.now(UTC)
            await self._tasks.save(task)
            await self._sync.enqueue(
                target_type="local_task",
                target_id=task.id,
                event_type=f"task_{target}",
                payload={"task_id": task.id, "status": task.status},
            )
        return row

    async def list_for_task(self, task_id: str) -> list[Approval]:
        return await self._approvals.list_for_task(task_id)

    async def any_pending_for_task(self, task_id: str) -> bool:
        for row in await self._approvals.list_for_task(task_id):
            if row.status == ApprovalStatus.PENDING.value:
                return True
        return False
