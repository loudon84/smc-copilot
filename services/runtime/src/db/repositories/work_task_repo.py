"""CRUD for work task execution tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.work_tasks import (
    TaskApproval,
    TaskArtifact,
    TaskExecutionQueue,
    TaskInteraction,
    TaskResourceLock,
    TaskRun,
    TaskRunCheckpoint,
    TaskRunEvent,
    TaskRoutingRule,
    WorkTask,
)


class WorkTaskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def add_task(self, row: WorkTask) -> WorkTask:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_task(self, task_id: str) -> WorkTask | None:
        return await self._s.get(WorkTask, task_id)

    async def get_task_by_assignment(self, assignment_id: str) -> WorkTask | None:
        result = await self._s.execute(
            select(WorkTask)
            .where(WorkTask.assignment_id == assignment_id)
            .order_by(WorkTask.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_tasks(self, *, limit: int = 200, status: str | None = None) -> list[WorkTask]:
        stmt = select(WorkTask).order_by(WorkTask.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(WorkTask.status == status)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def save_task(self, row: WorkTask) -> WorkTask:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_tasks_by_statuses(self, statuses: list[str], limit: int = 100) -> list[WorkTask]:
        result = await self._s.execute(select(WorkTask).where(WorkTask.status.in_(statuses)).limit(limit))
        return list(result.scalars().all())

    async def add_run(self, row: TaskRun) -> TaskRun:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_run(self, run_id: str) -> TaskRun | None:
        return await self._s.get(TaskRun, run_id)

    async def list_runs(self, task_id: str) -> list[TaskRun]:
        result = await self._s.execute(select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.run_number))
        return list(result.scalars().all())

    async def save_run(self, row: TaskRun) -> TaskRun:
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def count_active_runs_endpoint(self) -> int:
        active = ("starting", "running", "waiting_approval", "finalizing")
        result = await self._s.execute(select(func.count()).select_from(TaskRun).where(TaskRun.status.in_(active)))
        return int(result.scalar_one())

    async def count_active_runs_instance(self, instance_id: str) -> int:
        active = ("starting", "running", "waiting_approval", "finalizing")
        result = await self._s.execute(
            select(func.count())
            .select_from(TaskRun)
            .where(TaskRun.gateway_instance_id == instance_id, TaskRun.status.in_(active))
        )
        return int(result.scalar_one())

    async def next_event_sequence(self, run_id: str) -> int:
        result = await self._s.execute(select(func.max(TaskRunEvent.sequence)).where(TaskRunEvent.run_id == run_id))
        current = result.scalar_one_or_none()
        return int(current or 0) + 1

    async def add_event(self, row: TaskRunEvent) -> TaskRunEvent:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_events(
        self,
        task_id: str,
        *,
        after_sequence: int | None = None,
        limit: int = 500,
    ) -> list[TaskRunEvent]:
        stmt = (
            select(TaskRunEvent)
            .where(TaskRunEvent.task_id == task_id)
            .order_by(TaskRunEvent.created_at, TaskRunEvent.sequence)
        )
        if after_sequence is not None:
            stmt = stmt.where(TaskRunEvent.sequence > after_sequence)
        stmt = stmt.limit(limit)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def list_events_for_run(
        self,
        run_id: str,
        *,
        after_sequence: int | None = None,
        limit: int = 500,
    ) -> list[TaskRunEvent]:
        stmt = select(TaskRunEvent).where(TaskRunEvent.run_id == run_id).order_by(TaskRunEvent.sequence)
        if after_sequence is not None:
            stmt = stmt.where(TaskRunEvent.sequence > after_sequence)
        stmt = stmt.limit(limit)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def add_checkpoint(self, row: TaskRunCheckpoint) -> TaskRunCheckpoint:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def add_approval(self, row: TaskApproval) -> TaskApproval:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def add_artifact(self, row: TaskArtifact) -> TaskArtifact:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def add_lock(self, row: TaskResourceLock) -> TaskResourceLock:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def release_locks(self, task_id: str) -> None:
        result = await self._s.execute(
            select(TaskResourceLock).where(TaskResourceLock.task_id == task_id, TaskResourceLock.status == "held")
        )
        now = datetime.now()
        for lock in result.scalars().all():
            lock.status = "released"
            lock.released_at = now
        await self._s.flush()

    async def get_resource_lock(self, resource_type: str, resource_id: str) -> TaskResourceLock | None:
        result = await self._s.execute(
            select(TaskResourceLock).where(
                TaskResourceLock.resource_type == resource_type,
                TaskResourceLock.resource_id == resource_id,
                TaskResourceLock.status == "held",
            )
        )
        return result.scalar_one_or_none()

    async def reclaim_resource_lock(
        self, task_id: str, resource_type: str, resource_id: str
    ) -> TaskResourceLock | None:
        result = await self._s.execute(
            select(TaskResourceLock).where(
                TaskResourceLock.resource_type == resource_type,
                TaskResourceLock.resource_id == resource_id,
                TaskResourceLock.status == "released",
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        row.task_id = task_id
        row.status = "held"
        row.released_at = None
        await self._s.flush()
        return row

    async def list_runs_by_statuses(self, statuses: list[str], limit: int = 100) -> list[TaskRun]:
        result = await self._s.execute(select(TaskRun).where(TaskRun.status.in_(statuses)).limit(limit))
        return list(result.scalars().all())

    async def add_queue_entry(self, row: TaskExecutionQueue) -> TaskExecutionQueue:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_queue_entry(self, queue_id: str) -> TaskExecutionQueue | None:
        return await self._s.get(TaskExecutionQueue, queue_id)

    async def get_queue_entry_for_run(self, run_id: str) -> TaskExecutionQueue | None:
        result = await self._s.execute(
            select(TaskExecutionQueue)
            .where(TaskExecutionQueue.run_id == run_id)
            .order_by(TaskExecutionQueue.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_queue_by_statuses(self, statuses: list[str], limit: int = 200) -> list[TaskExecutionQueue]:
        result = await self._s.execute(
            select(TaskExecutionQueue)
            .where(TaskExecutionQueue.status.in_(statuses))
            .order_by(TaskExecutionQueue.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_approvals(self, task_id: str) -> list[TaskApproval]:
        result = await self._s.execute(
            select(TaskApproval).where(TaskApproval.task_id == task_id).order_by(TaskApproval.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_approval(self, approval_id: str) -> TaskApproval | None:
        return await self._s.get(TaskApproval, approval_id)

    async def list_artifacts(self, task_id: str) -> list[TaskArtifact]:
        result = await self._s.execute(
            select(TaskArtifact).where(TaskArtifact.task_id == task_id).order_by(TaskArtifact.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_artifact(self, artifact_id: str) -> TaskArtifact | None:
        return await self._s.get(TaskArtifact, artifact_id)

    async def list_interactions(self, task_id: str) -> list[TaskInteraction]:
        result = await self._s.execute(
            select(TaskInteraction).where(TaskInteraction.task_id == task_id).order_by(TaskInteraction.created_at.asc())
        )
        return list(result.scalars().all())

    async def add_interaction(self, row: TaskInteraction) -> TaskInteraction:
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def get_interaction(self, interaction_id: str) -> TaskInteraction | None:
        return await self._s.get(TaskInteraction, interaction_id)

    async def list_routing_rules(self, *, enabled_only: bool = True) -> list[TaskRoutingRule]:
        stmt = select(TaskRoutingRule).order_by(TaskRoutingRule.priority.desc(), TaskRoutingRule.task_type)
        if enabled_only:
            stmt = stmt.where(TaskRoutingRule.enabled.is_(True))
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def get_routing_rule(self, task_type: str) -> TaskRoutingRule | None:
        result = await self._s.execute(
            select(TaskRoutingRule).where(TaskRoutingRule.task_type == task_type, TaskRoutingRule.enabled.is_(True))
        )
        return result.scalar_one_or_none()

    async def get_routing_rule_row(self, task_type: str) -> TaskRoutingRule | None:
        result = await self._s.execute(select(TaskRoutingRule).where(TaskRoutingRule.task_type == task_type))
        return result.scalar_one_or_none()

    async def upsert_routing_rule(self, row: TaskRoutingRule) -> TaskRoutingRule:
        existing = await self.get_routing_rule_row(row.task_type)
        if existing is not None:
            existing.profile_type = row.profile_type
            existing.profile_id = row.profile_id
            existing.require_approval = row.require_approval
            existing.priority = row.priority
            existing.enabled = row.enabled
            existing.execution_mode = row.execution_mode
            await self._s.flush()
            await self._s.refresh(existing)
            return existing
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def count_queue_by_status(self) -> dict[str, int]:
        result = await self._s.execute(
            select(TaskExecutionQueue.status, func.count())
            .select_from(TaskExecutionQueue)
            .group_by(TaskExecutionQueue.status)
        )
        return {str(status): int(count) for status, count in result.all()}

    async def count_tasks_by_status(self, statuses: list[str]) -> int:
        result = await self._s.execute(
            select(func.count()).select_from(WorkTask).where(WorkTask.status.in_(statuses))
        )
        return int(result.scalar_one())

    async def count_failed_tasks_since(self, since: datetime) -> int:
        result = await self._s.execute(
            select(func.count())
            .select_from(WorkTask)
            .where(WorkTask.status == "failed", WorkTask.updated_at >= since)
        )
        return int(result.scalar_one())
