"""Startup recovery for durable task queue + in-flight runs (PRD v1.3 §11)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.enums import TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.event_store import TaskEventStore
from runtime.tasks.recovery import TaskRecovery
from runtime.tasks.state_machine import transition
from runtime.tasks.task_worker_manager import TaskWorkerManager
from services.gateway_supervisor import GatewaySupervisor

logger = get_logger(__name__)


# @lat: [[task-runtime#Durable Task Scheduler]]
class TaskRecoveryService:
    """Wraps TaskRecovery and extends it for durable queue lease repair."""

    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        supervisor: GatewaySupervisor,
        center,
    ) -> None:
        self._settings = settings
        self._session = session
        self._supervisor = supervisor
        self._center = center
        self._tasks = WorkTaskRepository(session)
        self._sync = EndpointSyncRepository(session)
        self._events = TaskEventStore(settings, session)
        self._legacy = TaskRecovery(settings, session, supervisor, center)

    async def recover_on_startup(self) -> int:
        count = 0
        now = datetime.now(UTC)

        # queued → leave in queue (continue)
        queued = await self._tasks.list_queue_by_statuses(["queued"], limit=500)
        count += len(queued)

        # claimed + expired lease → re-queue
        claimed = await self._tasks.list_queue_by_statuses(["claimed", "running"], limit=500)
        for row in claimed:
            lease = row.lease_expires_at
            if lease is not None and lease.tzinfo is None:
                lease = lease.replace(tzinfo=UTC)
            if row.status == "claimed" and (lease is None or lease < now):
                row.status = "queued"
                row.claimed_by = None
                row.claimed_at = None
                row.lease_expires_at = None
                row.available_at = now
                count += 1
            elif row.status == "running":
                # In-flight execution at restart → interrupt task, do not re-send Hermes.
                task = await self._tasks.get_task(row.task_id)
                run = await self._tasks.get_run(row.run_id)
                if task is not None and task.status not in {
                    WorkTaskStatus.COMPLETED.value,
                    WorkTaskStatus.CANCELLED.value,
                    WorkTaskStatus.INTERRUPTED.value,
                }:
                    transition(task, WorkTaskStatus.INTERRUPTED)
                    if run is not None:
                        run.status = TaskRunStatus.INTERRUPTED.value
                        run.exit_reason = "runtime_restarted"
                        run.finished_at = now
                        await self._events.append(
                            task_id=task.id,
                            run_id=run.id,
                            event_type="task.interrupted",
                            payload={"taskId": task.id, "reason": "RUNTIME_RESTARTED_DURING_TASK"},
                            assignment_id=task.assignment_id,
                        )
                row.status = "failed"
                count += 1

        # Also recover work tasks that were running without a queue row (legacy path).
        legacy_count = await self._legacy.recover_on_startup()
        count += legacy_count
        await self._session.flush()
        return count


async def recover_task_runtime(
    session_maker: async_sessionmaker[AsyncSession],
    *,
    settings: Settings,
    supervisor: GatewaySupervisor,
    center,
) -> int:
    """Lifespan entry: recover durable queue + start worker manager."""
    TaskWorkerManager.configure(
        settings=settings,
        session_maker=session_maker,
        center=center,
        supervisor=supervisor,
    )
    async with session_maker() as session:
        count = await TaskRecoveryService(settings, session, supervisor, center).recover_on_startup()
        await session.commit()
    await TaskWorkerManager.get().start()
    if count:
        TaskWorkerManager.get().wake()
    logger.info("task_runtime_recovered", count=count)
    return count
