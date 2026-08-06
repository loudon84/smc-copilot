"""Full task execution flow (FR-502)."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import RemoteAssignmentStatus, TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.models.endpoint_sync import RemoteTaskAssignment, TaskLease
from db.models.work_tasks import TaskResourceLock, TaskRun, WorkTask
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.experience_redactor import redact_payload
from runtime.tasks.cancellation import TaskCancellation
from runtime.tasks.event_store import TaskEventStore
from runtime.tasks.hermes_adapter import HermesRuntimeAdapter, StreamEvent
from runtime.tasks.scheduler import TaskExecutionScheduler
from services.endpoint_enrollment_service import EndpointEnrollmentService

logger = get_logger(__name__)


class TaskExecutor:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        supervisor,
        *,
        adapter: HermesRuntimeAdapter | None = None,
        scheduler: TaskExecutionScheduler | None = None,
        cancellation: TaskCancellation | None = None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._center = center
        self._supervisor = supervisor
        self._sync_repo = EndpointSyncRepository(session)
        self._tasks = WorkTaskRepository(session)
        self._enrollment = EndpointEnrollmentService(settings, session, center)
        self._adapter = adapter or HermesRuntimeAdapter(settings, session, supervisor)
        self._scheduler = scheduler or TaskExecutionScheduler()
        self._cancellation = cancellation or TaskCancellation(self._adapter)
        self._event_store = TaskEventStore(settings, session)

    async def schedule(self, task_id: str, *, priority: int = 0) -> None:
        task = await self._tasks.get_task(task_id)
        if task is None:
            return
        created = task.created_at.timestamp() if task.created_at else 0.0
        await self._scheduler.enqueue(task_id, priority=priority or task.priority, created_at=created)
        await self._drain_queue()

    async def _drain_queue(self) -> None:
        while True:
            next_id = await self._scheduler.pop_next()
            if not next_id:
                break
            task = await self._tasks.get_task(next_id)
            if task is None:
                continue
            if not await self._scheduler.try_acquire(next_id, task.instance_id):
                await self._scheduler.enqueue(next_id, priority=task.priority)
                break
            try:
                await self.execute(task.id)
            finally:
                await self._scheduler.release(task.instance_id)

    async def execute(self, task_id: str) -> WorkTask | None:
        task = await self._tasks.get_task(task_id)
        if task is None:
            return None
        if task.status in {
            WorkTaskStatus.COMPLETED.value,
            WorkTaskStatus.CANCELLED.value,
            WorkTaskStatus.MIGRATION_PENDING_REVIEW.value,
        }:
            return task

        assignment = None
        lease = None
        if task.assignment_id:
            assignment = await self._sync_repo.get_assignment_by_assignment_id(task.assignment_id)
            if assignment and assignment.status == RemoteAssignmentStatus.CANCELLED.value:
                task.status = WorkTaskStatus.CANCELLED.value
                return task
            lease = await self._sync_repo.get_active_lease(task.assignment_id)

        runs = await self._tasks.list_runs(task.id)
        run_number = len(runs) + 1
        run = TaskRun(
            task_id=task.id,
            run_number=run_number,
            status=TaskRunStatus.STARTING.value,
            gateway_instance_id=task.instance_id,
            lease_id=lease.lease_id if lease else None,
            started_at=datetime.now(UTC),
        )
        await self._tasks.add_run(run)

        task.status = WorkTaskStatus.VALIDATING.value
        await self._event_store.append(
            task_id=task.id,
            run_id=run.id,
            event_type="task.validating",
            payload={"taskId": task.id},
            assignment_id=task.assignment_id,
        )

        profile_id = task.profile_id or "default"
        try:
            ctx = await self._adapter.ensure_instance(profile_id)
            task.profile_id = ctx.profile_id
            task.instance_id = ctx.instance_id
            run.gateway_instance_id = ctx.instance_id
        except Exception as exc:
            task.status = WorkTaskStatus.FAILED.value
            run.status = TaskRunStatus.FAILED.value
            run.error_detail = str(exc)
            run.finished_at = datetime.now(UTC)
            await self._finalize_assignment(assignment, lease, run_id=run.id, failed=True, error=str(exc))
            return task

        if task.assignment_id and lease is None:
            task.status = WorkTaskStatus.EXPIRED.value
            run.status = TaskRunStatus.EXPIRED.value
            return task

        task.status = WorkTaskStatus.RUNNING.value
        run.status = TaskRunStatus.RUNNING.value
        await self._event_store.append(
            task_id=task.id,
            run_id=run.id,
            event_type="task.started",
            payload={"taskId": task.id, "runId": run.id},
            assignment_id=task.assignment_id,
        )

        stream_id = f"task_run_{run.id}"
        instructions = task.instructions or task.title
        failed = False
        error_detail: str | None = None
        usage_payload: dict[str, Any] | None = None

        try:
            async for event in self._adapter.stream_run(
                profile_id,
                instructions=instructions,
                stream_id=stream_id,
            ):
                if self._cancellation.is_cancelled(task.id):
                    failed = True
                    error_detail = "cancelled"
                    break
                await self._persist_stream_event(task, run, event)

                if event.event_name == "task.failed":
                    failed = True
                    error_detail = str(event.data.get("message") or "task_failed")
                    break
                if event.event_name == "run.usage_json":
                    usage_payload = event.data.get("usage") if isinstance(event.data, dict) else event.data

            if self._cancellation.is_cancelled(task.id):
                run.status = TaskRunStatus.CANCELLED.value
                task.status = WorkTaskStatus.CANCELLED.value
                await self._event_store.append(
                    task_id=task.id,
                    run_id=run.id,
                    event_type="task.cancelled",
                    payload={"taskId": task.id},
                    assignment_id=task.assignment_id,
                )
            elif failed:
                run.status = TaskRunStatus.FAILED.value
                run.error_detail = error_detail
                task.status = WorkTaskStatus.FAILED.value
                await self._event_store.append(
                    task_id=task.id,
                    run_id=run.id,
                    event_type="task.failed",
                    payload={"message": error_detail},
                    assignment_id=task.assignment_id,
                )
            else:
                run.status = TaskRunStatus.COMPLETED.value
                task.status = WorkTaskStatus.FINALIZING.value
                if usage_payload:
                    run.usage_json = json.dumps(usage_payload, default=str)
                await self._event_store.append(
                    task_id=task.id,
                    run_id=run.id,
                    event_type="task.completed",
                    payload={"taskId": task.id, "runId": run.id},
                    assignment_id=task.assignment_id,
                )
        except Exception as exc:
            logger.exception("task_execute_failed", task_id=task.id)
            run.status = TaskRunStatus.FAILED.value
            run.error_detail = str(exc)
            task.status = WorkTaskStatus.FAILED.value
            failed = True
            error_detail = str(exc)

        run.finished_at = datetime.now(UTC)
        await self._tasks.release_locks(task.id)

        if not failed and not self._cancellation.is_cancelled(task.id):
            await self._finalize_assignment(
                assignment, lease, run_id=run.id, result_summary=instructions[:200]
            )
            task.status = WorkTaskStatus.COMPLETED.value
            task.completed_at = datetime.now(UTC)
        elif task.status == WorkTaskStatus.FAILED.value:
            await self._finalize_assignment(assignment, lease, run_id=run.id, failed=True, error=error_detail)

        return task

    async def _persist_stream_event(self, task: WorkTask, run: TaskRun, event: StreamEvent) -> None:
        await self._event_store.append(
            task_id=task.id,
            run_id=run.id,
            event_type=event.event_name,
            payload=event.data,
            assignment_id=task.assignment_id,
        )

    async def _finalize_assignment(
        self,
        assignment: RemoteTaskAssignment | None,
        lease: TaskLease | None,
        *,
        run_id: str,
        failed: bool = False,
        error: str | None = None,
        result_summary: str | None = None,
    ) -> None:
        if assignment is None or not lease or lease.status != "active":
            return
        if assignment.assignment_id and lease.lease_id:
            if failed:
                assignment.status = RemoteAssignmentStatus.FAILED.value
                assignment.block_reason = error
            else:
                assignment.status = RemoteAssignmentStatus.DELIVERING.value
                result = redact_payload(
                    {
                        "assignmentId": assignment.assignment_id,
                        "status": "succeeded",
                        "summary": result_summary or "completed",
                    }
                )
                task_id = assignment.work_task_id or assignment.id
                await self._event_store.append(
                    task_id=task_id,
                    run_id=run_id,
                    event_type="task.result.ready",
                    payload=result,
                    assignment_id=assignment.assignment_id,
                )
                await self._center.complete(
                    assignment.assignment_id,
                    lease_id=lease.lease_id,
                    result=result,
                )
                assignment.status = RemoteAssignmentStatus.DELIVERED.value
                lease.status = "released"

    async def cancel(self, task_id: str) -> WorkTask | None:
        task = await self._tasks.get_task(task_id)
        if task is None:
            return None
        runs = await self._tasks.list_runs(task_id)
        active_run = next(
            (r for r in reversed(runs) if r.status in {"starting", "running", "waiting_approval"}),
            None,
        )
        event_run_id = active_run.id if active_run else (runs[-1].id if runs else None)
        if event_run_id is None:
            placeholder = await self._tasks.add_run(
                TaskRun(task_id=task.id, run_number=1, status=TaskRunStatus.CANCELLED.value)
            )
            event_run_id = placeholder.id

        await self._event_store.append(
            task_id=task.id,
            run_id=event_run_id,
            event_type="task.cancel.requested",
            payload={"taskId": task.id},
            assignment_id=task.assignment_id,
        )
        profile_id = task.profile_id or "default"
        await self._cancellation.execute_cancel(
            task_id=task.id,
            profile_id=profile_id,
            run_id=active_run.id if active_run else None,
        )
        task.status = WorkTaskStatus.CANCELLED.value
        if active_run:
            active_run.status = TaskRunStatus.CANCELLED.value
        if task.assignment_id:
            assignment = await self._sync_repo.get_assignment_by_assignment_id(task.assignment_id)
            if assignment:
                assignment.status = RemoteAssignmentStatus.CANCELLED.value
            lease = await self._sync_repo.get_active_lease(task.assignment_id)
            if lease:
                lease.status = "cancelled"
        await self._event_store.append(
            task_id=task.id,
            run_id=event_run_id,
            event_type="task.cancelled",
            payload={"taskId": task.id},
            assignment_id=task.assignment_id,
        )
        return task

    async def acquire_resource_lock(
        self, task_id: str, resource_type: str, resource_id: str
    ) -> bool:
        existing = await self._tasks.get_resource_lock(resource_type, resource_id)
        if existing and existing.task_id != task_id:
            return False
        await self._tasks.add_lock(
            TaskResourceLock(
                task_id=task_id,
                resource_type=resource_type,
                resource_id=resource_id,
                status="held",
            )
        )
        return True
