"""Atomic claim + execute for durable task queue (PRD v1.3 Phase 2)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.enums import TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.models.work_tasks import TaskExecutionQueue
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.tasks.executor import TaskExecutor
from runtime.tasks.registry import get_test_hermes_adapter
from runtime.tasks.state_machine import transition
from services.gateway_supervisor import GatewaySupervisor

logger = get_logger(__name__)

CLAIM_LEASE_SECONDS = 120
LOCK_RETRY_SECONDS = 5


# @lat: [[task-runtime#Durable Task Scheduler]]
class TaskWorker:
    def __init__(
        self,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        center: ServiceCenterClient,
        supervisor: GatewaySupervisor,
        *,
        worker_id: str | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._center = center
        self._supervisor = supervisor
        self._worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"

    async def claim_next(self, session: AsyncSession) -> TaskExecutionQueue | None:
        """Atomically claim the highest-priority available queued row (SQLite-safe)."""
        now = datetime.now(UTC)
        async with session.begin_nested():
            result = await session.execute(
                select(TaskExecutionQueue)
                .where(
                    TaskExecutionQueue.status == "queued",
                    TaskExecutionQueue.available_at <= now,
                )
                .order_by(TaskExecutionQueue.priority.desc(), TaskExecutionQueue.created_at.asc())
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row is None:
                return None
            row.status = "claimed"
            row.claimed_by = self._worker_id
            row.claimed_at = now
            row.lease_expires_at = now + timedelta(seconds=CLAIM_LEASE_SECONDS)
            row.attempt = int(row.attempt or 0) + 1
            await session.flush()
            return row

    async def process_one(self) -> bool:
        """Claim and execute one queue entry. Returns True if work was done."""
        async with self._session_maker() as session:
            claimed = await self.claim_next(session)
            if claimed is None:
                await session.commit()
                return False
            queue_id = claimed.id
            task_id = claimed.task_id
            run_id = claimed.run_id
            await session.commit()

        async with self._session_maker() as session:
            repo = WorkTaskRepository(session)
            queue_row = await repo.get_queue_entry(queue_id)
            task = await repo.get_task(task_id)
            run = await repo.get_run(run_id)
            if queue_row is None or task is None or run is None:
                await session.commit()
                return True

            if task.status == WorkTaskStatus.CANCELLED.value:
                queue_row.status = "cancelled"
                await session.commit()
                return True

            queue_row.status = "running"
            await session.flush()

            adapter = get_test_hermes_adapter()
            executor = TaskExecutor(
                self._settings,
                session,
                self._center,
                self._supervisor,
                adapter=adapter if adapter is not None else None,
            )
            resource_id = task.workspace_id or task.id
            locked = await executor.acquire_resource_lock(task_id, "workspace", resource_id)
            if not locked:
                queue_row.status = "queued"
                queue_row.available_at = datetime.now(UTC) + timedelta(seconds=LOCK_RETRY_SECONDS)
                queue_row.claimed_by = None
                queue_row.claimed_at = None
                queue_row.lease_expires_at = None
                await session.commit()
                return True

            try:
                await executor.execute(task_id, run_id=run_id)
                await session.refresh(task)
                if task.status == WorkTaskStatus.WAITING_APPROVAL.value:
                    queue_row.status = "claimed"
                    queue_row.lease_expires_at = datetime.now(UTC) + timedelta(seconds=CLAIM_LEASE_SECONDS * 10)
                elif task.status == WorkTaskStatus.WAITING_INPUT.value:
                    queue_row.status = "claimed"
                    queue_row.lease_expires_at = datetime.now(UTC) + timedelta(seconds=CLAIM_LEASE_SECONDS * 10)
                elif task.status in {
                    WorkTaskStatus.COMPLETED.value,
                    WorkTaskStatus.FINALIZING.value,
                }:
                    queue_row.status = "completed"
                elif task.status == WorkTaskStatus.CANCELLED.value:
                    queue_row.status = "cancelled"
                elif task.status == WorkTaskStatus.FAILED.value:
                    queue_row.status = "failed"
                else:
                    queue_row.status = "completed" if run.status == TaskRunStatus.COMPLETED.value else "failed"
            except Exception:
                logger.exception("task_worker_execute_failed", task_id=task_id, run_id=run_id)
                queue_row = await repo.get_queue_entry(queue_id)
                task = await repo.get_task(task_id)
                run = await repo.get_run(run_id)
                if queue_row is not None:
                    queue_row.status = "failed"
                if task is not None and task.status not in {
                    WorkTaskStatus.FAILED.value,
                    WorkTaskStatus.CANCELLED.value,
                    WorkTaskStatus.COMPLETED.value,
                }:
                    transition(task, WorkTaskStatus.FAILED)
                if run is not None and run.status not in {
                    TaskRunStatus.FAILED.value,
                    TaskRunStatus.CANCELLED.value,
                    TaskRunStatus.COMPLETED.value,
                }:
                    run.status = TaskRunStatus.FAILED.value
                    run.finished_at = datetime.now(UTC)
            await session.commit()
            return True
