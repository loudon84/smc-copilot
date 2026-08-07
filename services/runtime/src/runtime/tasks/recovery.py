"""Startup recovery for in-flight task runs (FR-507 + PRD v1.3 §11)."""

from __future__ import annotations

from datetime import UTC, datetime

from core.enums import TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.event_store import TaskEventStore
from runtime.tasks.hermes_adapter import HermesRuntimeAdapter
from runtime.tasks.state_machine import transition

logger = get_logger(__name__)

_RECOVERABLE_TASK = frozenset(
    {
        WorkTaskStatus.STARTING.value,
        WorkTaskStatus.RUNNING.value,
        WorkTaskStatus.WAITING_APPROVAL.value,
        WorkTaskStatus.WAITING_INPUT.value,
        WorkTaskStatus.VALIDATING.value,
        WorkTaskStatus.FINALIZING.value,
        WorkTaskStatus.DELIVERING.value,
    }
)

_RECOVERABLE_RUN = frozenset(
    {
        TaskRunStatus.STARTING.value,
        TaskRunStatus.RUNNING.value,
        TaskRunStatus.WAITING_APPROVAL.value,
        TaskRunStatus.WAITING_INPUT.value,
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

        if task.assignment_id:
            lease = await self._sync.get_active_lease(task.assignment_id)
            if lease:
                expires = lease.expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=UTC)
                if expires < datetime.now(UTC):
                    transition(task, WorkTaskStatus.EXPIRED)
                    for run in active_runs:
                        run.status = TaskRunStatus.EXPIRED.value
                        run.exit_reason = "lease_expired"
                    return True

        # Running tasks that already produced side effects become interrupted (no auto re-exec).
        transition(task, WorkTaskStatus.INTERRUPTED)
        for run in active_runs:
            run.status = TaskRunStatus.INTERRUPTED.value
            run.exit_reason = "runtime_restarted"
            run.finished_at = datetime.now(UTC)
        await self._events.append(
            task_id=task.id,
            run_id=active_runs[-1].id,
            event_type="task.interrupted",
            payload={"taskId": task.id, "reason": "RUNTIME_RESTARTED_DURING_TASK"},
            assignment_id=task.assignment_id,
        )
        return True
