"""Full task execution flow (FR-502)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import RemoteAssignmentStatus, TaskRunStatus, WorkTaskStatus
from core.logging import get_logger
from db.models.endpoint_sync import RemoteTaskAssignment, TaskLease
from db.models.work_tasks import TaskApproval, TaskInteraction, TaskResourceLock, TaskRun, TaskRunCheckpoint, WorkTask
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.experience_redactor import redact_payload
from runtime.execution.kernel import AgentExecutionKernel
from runtime.execution.request import AgentExecutionRequest
from runtime.tasks.artifact_scanner import ArtifactScanner
from runtime.tasks.cancellation import TaskCancellation
from runtime.tasks.event_store import TaskEventStore
from runtime.tasks.hermes_adapter import HermesRuntimeAdapter
from runtime.tasks.scheduler import TaskExecutionScheduler
from runtime.tasks.state_machine import transition
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
        """Legacy memory enqueue + drain. Prefer WorkTaskService.start durable queue path."""
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

    async def execute(self, task_id: str, *, run_id: str | None = None) -> WorkTask | None:
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
                transition(task, WorkTaskStatus.CANCELLED)
                return task
            lease = await self._sync_repo.get_active_lease(task.assignment_id)

        if run_id:
            run = await self._tasks.get_run(run_id)
            if run is None:
                return task
        else:
            runs = await self._tasks.list_runs(task.id)
            run = TaskRun(
                task_id=task.id,
                run_number=len(runs) + 1,
                status=TaskRunStatus.STARTING.value,
                chat_run_id=task.chat_run_id,
                gateway_instance_id=task.instance_id,
                lease_id=lease.lease_id if lease else None,
                started_at=datetime.now(UTC),
            )
            await self._tasks.add_run(run)
            task.active_run_id = run.id

        if task.status not in {
            WorkTaskStatus.VALIDATING.value,
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.WAITING_APPROVAL.value,
            WorkTaskStatus.WAITING_INPUT.value,
        }:
            transition(task, WorkTaskStatus.VALIDATING)
        await self._event_store.append(
            task_id=task.id,
            run_id=run.id,
            event_type="task.updated",
            payload={"taskId": task.id, "step": "validating"},
            assignment_id=task.assignment_id,
        )
        await self._tasks.add_checkpoint(
            TaskRunCheckpoint(
                run_id=run.id,
                checkpoint_type="execution",
                payload_json=json.dumps({"step": "validating", "safeResume": False}),
            )
        )

        profile_id = task.profile_id or "default"
        try:
            ctx = await self._adapter.ensure_instance(profile_id)
            task.profile_id = ctx.profile_id
            task.instance_id = ctx.instance_id
            run.gateway_instance_id = ctx.instance_id
        except Exception as exc:
            transition(task, WorkTaskStatus.FAILED)
            run.status = TaskRunStatus.FAILED.value
            run.error_detail = str(exc)
            run.finished_at = datetime.now(UTC)
            task.error_message = str(exc)
            await self._finalize_assignment(assignment, lease, run_id=run.id, failed=True, error=str(exc))
            return task

        if task.assignment_id and lease is None:
            transition(task, WorkTaskStatus.EXPIRED)
            run.status = TaskRunStatus.EXPIRED.value
            return task

        transition(task, WorkTaskStatus.RUNNING)
        run.status = TaskRunStatus.RUNNING.value
        await self._event_store.append(
            task_id=task.id,
            run_id=run.id,
            event_type="task.started",
            payload={"taskId": task.id, "runId": run.id},
            assignment_id=task.assignment_id,
        )

        instructions = task.instructions or task.title
        failed = False
        error_detail: str | None = None
        usage_payload: dict[str, Any] | None = None
        cancel = asyncio.Event()
        approval_policy = None
        if task.approval_policy_json:
            try:
                approval_policy = json.loads(task.approval_policy_json)
            except json.JSONDecodeError:
                approval_policy = None

        kernel = AgentExecutionKernel(self._session, settings=self._settings)
        request = AgentExecutionRequest(
            execution_id=run.id,
            profile_id=profile_id,
            instance_id=task.instance_id or profile_id,
            session_id=run.hermes_session_id or task.chat_run_id,
            input=instructions,
            workspace_id=task.workspace_id,
            approval_policy=approval_policy if isinstance(approval_policy, dict) else None,
            context={"taskId": task.id, "runId": run.id},
        )

        try:
            async for event in kernel.execute(request, cancel):
                if self._cancellation.is_cancelled(task.id):
                    cancel.set()
                    failed = True
                    error_detail = "cancelled"
                    break

                event_type = event.type
                if event_type == "session.started":
                    sid = event.payload.get("sessionId") or event.payload.get("session_id")
                    if sid:
                        run.hermes_session_id = str(sid)

                mapped_type = {
                    "agent.message.delta": "task.message.delta",
                    "agent.message.completed": "task.message.completed",
                    "reasoning.delta": "task.reasoning.delta",
                    "tool.started": "task.tool.started",
                    "tool.progress": "task.tool.progress",
                    "tool.completed": "task.tool.completed",
                    "tool.failed": "task.tool.failed",
                    "usage.updated": "task.usage.updated",
                    "interaction.approval": "task.approval.requested",
                    "interaction.clarify": "task.input.requested",
                    "execution.completed": "task.completed",
                    "execution.failed": "task.failed",
                    "execution.cancelled": "task.cancelled",
                    "session.started": "task.updated",
                }.get(event_type, event_type)
                if mapped_type not in {
                    "task.message.delta",
                    "task.message.completed",
                    "task.reasoning.delta",
                    "task.tool.started",
                    "task.tool.progress",
                    "task.tool.completed",
                    "task.tool.failed",
                    "task.usage.updated",
                    "task.approval.requested",
                    "task.input.requested",
                    "task.completed",
                    "task.failed",
                    "task.cancelled",
                    "task.updated",
                    "task.started",
                }:
                    mapped_type = "task.updated"

                await self._event_store.append(
                    task_id=task.id,
                    run_id=run.id,
                    event_type=mapped_type,
                    payload=event.payload,
                    assignment_id=task.assignment_id,
                )

                if event_type == "interaction.clarify":
                    await self._tasks.add_interaction(
                        TaskInteraction(
                            task_id=task.id,
                            run_id=run.id,
                            interaction_type="clarify",
                            status="pending",
                            prompt_json=json.dumps(event.payload, default=str),
                            payload_json=json.dumps(event.payload, default=str),
                        )
                    )
                    await self._tasks.add_checkpoint(
                        TaskRunCheckpoint(
                            run_id=run.id,
                            checkpoint_type="interaction",
                            payload_json=json.dumps({"step": "waiting_input", "safeResume": True}),
                        )
                    )
                    transition(task, WorkTaskStatus.WAITING_INPUT)
                    run.status = TaskRunStatus.WAITING_INPUT.value
                    return task

                if event_type == "interaction.approval":
                    await self._tasks.add_approval(
                        TaskApproval(
                            task_id=task.id,
                            run_id=run.id,
                            tool_call_id=str(event.payload.get("toolCallId") or event.payload.get("id") or ""),
                            status="pending",
                            payload_json=json.dumps(event.payload, default=str),
                        )
                    )
                    transition(task, WorkTaskStatus.WAITING_APPROVAL)
                    run.status = TaskRunStatus.WAITING_APPROVAL.value
                    await self._tasks.add_checkpoint(
                        TaskRunCheckpoint(
                            run_id=run.id,
                            checkpoint_type="interaction",
                            payload_json=json.dumps({"step": "waiting_approval", "safeResume": True}),
                        )
                    )
                    return task

                if event_type == "usage.updated":
                    usage_payload = event.payload.get("usage") if isinstance(event.payload, dict) else event.payload
                if event_type == "execution.failed":
                    failed = True
                    error_detail = str(event.payload.get("message") or "task_failed")
                    break
                if event_type == "execution.cancelled":
                    failed = True
                    error_detail = "cancelled"
                    break

            if self._cancellation.is_cancelled(task.id) or error_detail == "cancelled":
                run.status = TaskRunStatus.CANCELLED.value
                transition(task, WorkTaskStatus.CANCELLED)
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
                transition(task, WorkTaskStatus.FAILED)
                task.error_message = error_detail
                await self._event_store.append(
                    task_id=task.id,
                    run_id=run.id,
                    event_type="task.failed",
                    payload={"message": error_detail},
                    assignment_id=task.assignment_id,
                )
            else:
                run.status = TaskRunStatus.COMPLETED.value
                transition(task, WorkTaskStatus.FINALIZING)
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
            transition(task, WorkTaskStatus.FAILED)
            task.error_message = str(exc)
            failed = True
            error_detail = str(exc)

        run.finished_at = datetime.now(UTC)
        if task.status not in {
            WorkTaskStatus.WAITING_APPROVAL.value,
            WorkTaskStatus.WAITING_INPUT.value,
        }:
            await self._tasks.release_locks(task.id)

        if not failed and not self._cancellation.is_cancelled(task.id):
            if task.status not in {
                WorkTaskStatus.WAITING_APPROVAL.value,
                WorkTaskStatus.WAITING_INPUT.value,
            }:
                scanner = ArtifactScanner(self._settings, self._session)
                output_dir = scanner.resolve_output_dir(task.workspace_id, task.id)
                await scanner.scan_directory(
                    task_id=task.id,
                    run_id=run.id,
                    directory=output_dir,
                    assignment_id=task.assignment_id,
                )
            await self._finalize_assignment(assignment, lease, run_id=run.id, result_summary=instructions[:200])
            if task.status not in {
                WorkTaskStatus.WAITING_APPROVAL.value,
                WorkTaskStatus.WAITING_INPUT.value,
            }:
                transition(task, WorkTaskStatus.COMPLETED)
                task.completed_at = datetime.now(UTC)
                task.result_summary = instructions[:200]
        elif task.status == WorkTaskStatus.FAILED.value:
            await self._finalize_assignment(assignment, lease, run_id=run.id, failed=True, error=error_detail)

        return task

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
                    event_type="task.updated",
                    payload={"kind": "result_ready", **result},
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
        if task.status in {WorkTaskStatus.COMPLETED.value, WorkTaskStatus.CANCELLED.value}:
            return task
        runs = await self._tasks.list_runs(task_id)
        active_run = next(
            (r for r in reversed(runs) if r.status in {"starting", "running", "waiting_approval", "waiting_input"}),
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
            event_type="task.updated",
            payload={"taskId": task.id, "action": "cancel_requested"},
            assignment_id=task.assignment_id,
        )
        profile_id = task.profile_id or "default"
        await self._cancellation.execute_cancel(
            task_id=task.id,
            profile_id=profile_id,
            run_id=active_run.id if active_run else None,
        )
        transition(task, WorkTaskStatus.CANCELLED)
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

    async def acquire_resource_lock(self, task_id: str, resource_type: str, resource_id: str) -> bool:
        existing = await self._tasks.get_resource_lock(resource_type, resource_id)
        if existing is not None:
            return existing.task_id == task_id
        reused = await self._tasks.reclaim_resource_lock(task_id, resource_type, resource_id)
        if reused is not None:
            return True
        await self._tasks.add_lock(
            TaskResourceLock(
                task_id=task_id,
                resource_type=resource_type,
                resource_id=resource_id,
                status="held",
            )
        )
        return True
