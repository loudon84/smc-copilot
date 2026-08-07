from __future__ import annotations

import json

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.local_task import LocalTask
from db.models.task_related import Approval, AuditLog, SyncOutbox, TaskEvent, TeamTaskBinding
from db.models.workspace_db import Workspace


class TaskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, task_id: str) -> LocalTask | None:
        return await self._s.get(LocalTask, task_id)

    async def list_all(self, *, limit: int = 200, offset: int = 0) -> list[LocalTask]:
        result = await self._s.execute(
            select(LocalTask).order_by(LocalTask.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, task: LocalTask) -> LocalTask:
        self._s.add(task)
        await self._s.flush()
        await self._s.refresh(task)
        return task

    async def save(self, task: LocalTask) -> LocalTask:
        await self._s.flush()
        await self._s.refresh(task)
        return task


class TaskEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_task(self, task_id: str, *, limit: int = 500) -> list[TaskEvent]:
        result = await self._s.execute(
            select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.created_at).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_task_after(
        self,
        task_id: str,
        *,
        after_id: str | None = None,
        limit: int = 500,
    ) -> list[TaskEvent]:
        stmt = select(TaskEvent).where(TaskEvent.task_id == task_id)
        if after_id:
            ref = await self._s.get(TaskEvent, after_id)
            if ref is not None:
                stmt = stmt.where(
                    (TaskEvent.created_at > ref.created_at)
                    | ((TaskEvent.created_at == ref.created_at) & (TaskEvent.id > ref.id))
                )
        stmt = stmt.order_by(TaskEvent.created_at, TaskEvent.id).limit(limit)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def list_recent_global_events(
        self,
        *,
        after_id: str | None = None,
        limit: int = 200,
    ) -> list[TaskEvent]:
        stmt = select(TaskEvent)
        if after_id:
            ref = await self._s.get(TaskEvent, after_id)
            if ref is not None:
                stmt = stmt.where(
                    (TaskEvent.created_at > ref.created_at)
                    | ((TaskEvent.created_at == ref.created_at) & (TaskEvent.id > ref.id))
                )
        stmt = stmt.order_by(TaskEvent.created_at, TaskEvent.id).limit(limit)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def create(self, event: TaskEvent) -> TaskEvent:
        self._s.add(event)
        await self._s.flush()
        await self._s.refresh(event)
        return event

    async def list_by_profile_id(self, profile_id: str, *, limit: int = 200) -> list[TaskEvent]:
        stmt = (
            select(TaskEvent)
            .join(LocalTask, TaskEvent.task_id == LocalTask.id)
            .where(LocalTask.target_profile_id == profile_id)
            .order_by(TaskEvent.created_at.desc(), TaskEvent.id.desc())
            .limit(limit)
        )
        result = await self._s.execute(stmt)
        return list(result.scalars().all())


class TeamTaskBindingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_remote(self, remote_task_id: str, assignment_id: str) -> TeamTaskBinding | None:
        result = await self._s.execute(
            select(TeamTaskBinding).where(
                TeamTaskBinding.remote_task_id == remote_task_id,
                TeamTaskBinding.assignment_id == assignment_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, row: TeamTaskBinding) -> TeamTaskBinding:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save(self, row: TeamTaskBinding) -> TeamTaskBinding:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get(self, binding_id: str) -> TeamTaskBinding | None:
        return await self._s.get(TeamTaskBinding, binding_id)

    async def list_recent(self, *, limit: int = 100, offset: int = 0) -> list[TeamTaskBinding]:
        result = await self._s.execute(
            select(TeamTaskBinding).order_by(TeamTaskBinding.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())


class ApprovalRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, approval_id: str) -> Approval | None:
        return await self._s.get(Approval, approval_id)

    async def list_pending(self) -> list[Approval]:
        result = await self._s.execute(select(Approval).where(Approval.status == "pending").order_by(Approval.created_at))
        return list(result.scalars().all())

    async def list_all(self, limit: int = 200) -> list[Approval]:
        result = await self._s.execute(select(Approval).order_by(Approval.created_at.desc()).limit(limit))
        return list(result.scalars().all())

    async def list_for_task(self, task_id: str) -> list[Approval]:
        result = await self._s.execute(select(Approval).where(Approval.task_id == task_id).order_by(Approval.created_at))
        return list(result.scalars().all())

    async def create(self, row: Approval) -> Approval:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save(self, row: Approval) -> Approval:
        await self._s.flush()
        await self._s.refresh(row)
        return row


class WorkspaceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, workspace_id: str) -> Workspace | None:
        return await self._s.get(Workspace, workspace_id)

    async def list_all(self) -> list[Workspace]:
        result = await self._s.execute(select(Workspace).order_by(Workspace.name))
        return list(result.scalars().all())

    async def create(self, row: Workspace) -> Workspace:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save(self, row: Workspace) -> Workspace:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def delete(self, row: Workspace) -> None:
        await self._s.delete(row)
        await self._s.flush()


class SyncOutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_pending(self, *, limit: int = 50) -> list[SyncOutbox]:
        result = await self._s.execute(
            select(SyncOutbox).where(SyncOutbox.status == "pending").order_by(SyncOutbox.created_at).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, row: SyncOutbox) -> SyncOutbox:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def save(self, row: SyncOutbox) -> SyncOutbox:
        await self._s.flush()
        await self._s.refresh(row)
        return row


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def log(
        self,
        *,
        action: str,
        actor: str | None = None,
        task_id: str | None = None,
        approval_id: str | None = None,
        payload: dict | None = None,
    ) -> AuditLog:
        row = AuditLog(
            action=action,
            actor=actor,
            task_id=task_id,
            approval_id=approval_id,
            payload_json=json.dumps(payload) if payload is not None else None,
        )
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_by_profile_id(self, profile_id: str, *, limit: int = 200) -> list[AuditLog]:
        stmt = (
            select(AuditLog)
            .where(func.json_extract(AuditLog.payload_json, "$.profile_id") == profile_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
        result = await self._s.execute(stmt)
        return list(result.scalars().all())
