"""Startup recovery for in-flight task runs (FR-507)."""

from __future__ import annotations

from datetime import UTC, datetime

from core.enums import TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.event_store import TaskEventStore
from runtime.tasks.hermes_adapter import HermesRuntimeAdapter

logger = get_logger(__name__)

_RECOVERABLE_TASK = frozenset(
    {
        WorkTaskStatus.STARTING.value,
        WorkTaskStatus.RUNNING.value,
        WorkTaskStatus.WAITING_APPROVAL.value,
        WorkTaskStatus.FINALIZING.value,
        WorkTaskStatus.DELIVERING.value,
    }
)

_RECOVERABLE_RUN = frozenset(
    {
        TaskRunStatus.STARTING.value,
        TaskRunStatus.RUNNING.value,
        TaskRunStatus.WAITING_APPROVAL.value,
        TaskRunStatus.FINALIZING.value,
    }
)


# @lat: [[endpoint-sync#Work Task Execution#Task Recovery]]
class TaskRecovery:
    def __init__(self, settings, session, supervisor, center) -> None:
        self._settings = settings
        self._session = session
        self._tasks = WorkTaskRepository(session)
        self._sync = EndpointSyncRepository(session)
        self._adapter = HermesRuntimeAdapter(settings, session, supervisor)
        self._events = TaskEventStore(settings, session)

    async def recover_on_startup(self) -> int:
        count = 0
        tasks = await self._tasks.list_tasks_by_statuses(list(_RECOVERABLE_TASK), limit=200)
        for task in tasks:
            handled = await self._recover_task(task)
            if handled:
                count += 1
        await self._session.flush()
        return count

    async def _recover_task(self, task) -> bool:
        runs = await self._tasks.list_runs(task.id)
        active_runs = [r for r in runs if r.status in _RECOVERABLE_RUN]
        if not active_runs:
            return False

        lease = None
        if task.assignment_id:
            lease = await self._sync.get_active_lease(task.assignment_id)
            if lease:
                expires = lease.expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=UTC)
                if expires < datetime.now(UTC):
                    task.status = WorkTaskStatus.EXPIRED.value
                    for run in active_runs:
                        run.status = TaskRunStatus.EXPIRED.value
                        run.exit_reason = "lease_expired"
                    return True

        profile_id = task.profile_id or "default"
        healthy = await self._adapter.health(profile_id)
        if not healthy:
            task.status = WorkTaskStatus.ORPHANED.value
            for run in active_runs:
                run.status = TaskRunStatus.ORPHANED.value
                run.exit_reason = "gateway_unreachable"
            await self._events.append(
                task_id=task.id,
                run_id=active_runs[-1].id,
                event_type="runtime.recovery.completed",
                payload={"status": "orphaned", "taskId": task.id},
                assignment_id=task.assignment_id,
            )
            return True

        await self._events.append(
            task_id=task.id,
            run_id=active_runs[-1].id,
            event_type="runtime.recovery.started",
            payload={"taskId": task.id},
            assignment_id=task.assignment_id,
        )
        task.status = WorkTaskStatus.QUEUED.value
        return True
