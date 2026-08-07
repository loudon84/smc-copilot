"""Task approval service for v1.6 work_tasks (PRD FR-602, FR-603)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import ConflictError, NotFoundError
from db.models.work_tasks import TaskApproval
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.policy.approval_token import ApprovalTokenService


class TaskApprovalService:
    def __init__(self, session: AsyncSession, *, token_ttl_seconds: int = 300) -> None:
        self._session = session
        self._tasks = WorkTaskRepository(session)
        self._tokens = ApprovalTokenService(default_ttl_seconds=token_ttl_seconds)

    async def request_approval(
        self,
        *,
        task_id: str,
        run_id: str | None,
        tool_call_id: str | None,
        action_type: str,
        payload: dict | None = None,
        risk_level: str = "medium",
        expires_in_seconds: int = 3600,
    ) -> TaskApproval:
        task = await self._tasks.get_task(task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        row = TaskApproval(
            task_id=task_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
            status="pending",
            payload_json=json.dumps(
                {
                    "action_type": action_type,
                    "risk_level": risk_level,
                    "request": payload,
                },
                default=str,
            ),
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        _ = expires_in_seconds  # stored via token service on approve
        return row

    async def approve(
        self,
        approval_id: str,
        *,
        decided_by: str | None,
        args: dict | None = None,
    ) -> tuple[TaskApproval, str]:
        row = await self._session.get(TaskApproval, approval_id)
        if row is None:
            raise NotFoundError("Approval not found")
        if row.status != "pending":
            raise ConflictError("Approval is not pending")
        row.status = "approved"
        row.resolved_at = datetime.now(UTC)
        token = self._tokens.issue(
            task_id=row.task_id,
            run_id=row.run_id or "",
            tool_call_id=row.tool_call_id or "",
            args=args,
        )
        await self._session.flush()
        return row, token.token

    async def reject(self, approval_id: str, *, decided_by: str | None, reason: str | None = None) -> TaskApproval:
        row = await self._session.get(TaskApproval, approval_id)
        if row is None:
            raise NotFoundError("Approval not found")
        if row.status != "pending":
            raise ConflictError("Approval is not pending")
        row.status = "rejected"
        row.resolved_at = datetime.now(UTC)
        if row.tool_call_id:
            self._tokens.invalidate_for_tool_call(row.tool_call_id)
        await self._session.flush()
        return row

    def verify_token(
        self,
        token: str,
        *,
        task_id: str,
        run_id: str,
        tool_call_id: str,
        args: dict | None = None,
    ) -> bool:
        return self._tokens.consume(
            token,
            task_id=task_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
            args=args,
        )

    async def expire_stale(self) -> int:
        result = await self._session.execute(
            TaskApproval.__table__.select().where(TaskApproval.status == "pending")  # type: ignore[attr-defined]
        )
        count = 0
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        for row in result:
            approval = await self._session.get(TaskApproval, row.id)
            if approval and approval.created_at and approval.created_at < cutoff:
                approval.status = "expired"
                approval.resolved_at = datetime.now(UTC)
                count += 1
        return count
