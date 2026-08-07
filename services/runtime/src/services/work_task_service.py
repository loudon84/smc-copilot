"""Work task orchestration (FR-401 + PRD v1.3 Domain SOT)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import RemoteAssignmentStatus, SyncBindingStatus, WorkTaskStatus, WorkTaskType
from core.errors import ConflictError, NotFoundError, StateMachineError
from core.task_routing import DEFAULT_TASK_ROUTING, RoutingRule
from db.models.endpoint_sync import RemoteTaskAssignment, TaskLease
from db.models.task_related import TeamTaskBinding
from db.models.work_tasks import TaskExecutionQueue, TaskInteraction, TaskRoutingRule, TaskRun, WorkTask
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import TeamTaskBindingRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient
from integrations.team_hub.client import TeamHubClient
from integrations.team_hub.dto import RemoteAssignmentDTO
from runtime.tasks.executor import TaskExecutor
from runtime.tasks.registry import get_task_scheduler, get_test_hermes_adapter
from runtime.tasks.state_machine import transition
from runtime.tasks.task_worker_manager import TaskWorkerManager
from schemas.work_tasks import (
    TaskEventResponse,
    TaskApprovalResponse,
    TaskArtifactResponse,
    TaskInteractionResponse,
    TaskRunResponse,
    TaskSnapshotResponse,
    TaskStartResult,
    WorkTaskAssignBody,
    WorkTaskCreate,
    WorkTaskListResponse,
    WorkTaskPatch,
    WorkTaskResponse,
)
from services.endpoint_enrollment_service import EndpointEnrollmentService
from services.gateway_supervisor import GatewaySupervisor
from services.task_approval_service import TaskApprovalService
from services.task_event_service import TaskEventService

_LEGACY_TYPE_MAP = {
    "coding_task": WorkTaskType.CODING.value,
    "general": WorkTaskType.BUSINESS.value,
    "remote": WorkTaskType.REMOTE_ASSIGNMENT.value,
    "local": WorkTaskType.CODING.value,
}


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _loads(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _normalize_task_type(task_type: str | None) -> str:
    value = (task_type or WorkTaskType.CODING.value).strip()
    mapped = _LEGACY_TYPE_MAP.get(value, value)
    try:
        return WorkTaskType(mapped).value
    except ValueError:
        return WorkTaskType.CODING.value


# @lat: [[endpoint-sync#Work Task Execution#Work Task Service]]
class WorkTaskService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
        supervisor: GatewaySupervisor,
    ) -> None:
        self._settings = settings
        self._session = session
        self._center = center
        self._supervisor = supervisor
        self._repo = WorkTaskRepository(session)
        self._sync = EndpointSyncRepository(session)
        self._enrollment = EndpointEnrollmentService(settings, session, center)

    def _executor(self) -> TaskExecutor:
        adapter = get_test_hermes_adapter()
        return TaskExecutor(
            self._settings,
            self._session,
            self._center,
            self._supervisor,
            adapter=adapter if adapter is not None else None,
            scheduler=get_task_scheduler(),
        )

    def _to_response(self, row: WorkTask) -> WorkTaskResponse:
        return WorkTaskResponse(
            id=row.id,
            source=row.source,
            sourceTaskId=row.source_task_id,
            assignmentId=row.assignment_id,
            title=row.title,
            description=row.description,
            taskType=row.task_type,
            priority=row.priority,
            status=row.status,
            profileId=row.profile_id,
            instanceId=row.instance_id,
            assignedProfileId=row.assigned_profile_id,
            assignedInstanceId=row.assigned_instance_id,
            workspaceId=row.workspace_id,
            activeRunId=row.active_run_id,
            chatRunId=row.chat_run_id,
            parentTaskId=row.parent_task_id,
            instructions=row.instructions,
            payload=_loads(row.payload_json),
            approvalPolicy=_loads(row.approval_policy_json),
            workspacePolicy=_loads(row.workspace_policy_json),
            toolPolicy=_loads(row.tool_policy_json),
            dataPolicy=_loads(row.data_policy_json),
            resultSummary=row.result_summary,
            errorCode=row.error_code,
            errorMessage=row.error_message,
            createdBy=row.created_by,
            legacySourceId=row.legacy_source_id,
            deadline=row.deadline,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
            completedAt=row.completed_at,
        )

    def _to_dict(self, row: WorkTask) -> dict[str, Any]:
        return self._to_response(row).model_dump(by_alias=True, mode="json")

    async def list_tasks(
        self,
        *,
        limit: int = 50,
        cursor: str | None = None,
        status: str | None = None,
        task_type: str | None = None,
        source: str | None = None,
        profile_id: str | None = None,
        instance_id: str | None = None,
        workspace_id: str | None = None,
        search: str | None = None,
        created_after: datetime | None = None,
        created_before: datetime | None = None,
    ) -> WorkTaskListResponse:
        limit = max(1, min(limit, 100))
        stmt = select(WorkTask)
        filters: list[Any] = []
        if status:
            filters.append(WorkTask.status == status)
        if task_type:
            filters.append(WorkTask.task_type == task_type)
        if source:
            filters.append(WorkTask.source == source)
        if profile_id:
            filters.append(WorkTask.profile_id == profile_id)
        if instance_id:
            filters.append(WorkTask.instance_id == instance_id)
        if workspace_id:
            filters.append(WorkTask.workspace_id == workspace_id)
        if search:
            like = f"%{search}%"
            filters.append(or_(WorkTask.title.ilike(like), WorkTask.task_type.ilike(like)))
        if created_after:
            filters.append(WorkTask.created_at >= created_after)
        if created_before:
            filters.append(WorkTask.created_at <= created_before)
        if cursor:
            cursor_row = await self._repo.get_task(cursor)
            if cursor_row is not None and cursor_row.created_at is not None:
                filters.append(
                    or_(
                        WorkTask.created_at < cursor_row.created_at,
                        and_(WorkTask.created_at == cursor_row.created_at, WorkTask.id < cursor_row.id),
                    )
                )
        if filters:
            stmt = stmt.where(*filters)
        stmt = stmt.order_by(WorkTask.created_at.desc(), WorkTask.id.desc()).limit(limit + 1)
        result = await self._session.execute(stmt)
        rows = list(result.scalars().all())
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            next_cursor = rows[-1].id if rows else None
        return WorkTaskListResponse(
            items=[self._to_response(r) for r in rows],
            nextCursor=next_cursor,
        )

    async def get_task(self, task_id: str) -> WorkTaskResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        return self._to_response(row)

    async def create_task(self, body: WorkTaskCreate) -> WorkTaskResponse:
        row = WorkTask(
            source=body.source,
            source_task_id=body.source_task_id,
            assignment_id=body.assignment_id,
            title=body.title,
            description=body.description,
            task_type=_normalize_task_type(body.task_type),
            priority=body.priority,
            status=WorkTaskStatus.DRAFT.value,
            profile_id=body.profile_id,
            instance_id=body.instance_id,
            assigned_profile_id=body.profile_id,
            assigned_instance_id=body.instance_id,
            workspace_id=body.workspace_id,
            chat_run_id=body.chat_run_id,
            parent_task_id=body.parent_task_id,
            instructions=body.instructions,
            payload_json=json.dumps(body.payload, ensure_ascii=False) if body.payload is not None else None,
            approval_policy_json=(
                json.dumps(body.approval_policy, ensure_ascii=False) if body.approval_policy is not None else None
            ),
            workspace_policy_json=(
                json.dumps(body.workspace_policy, ensure_ascii=False) if body.workspace_policy is not None else None
            ),
            tool_policy_json=json.dumps(body.tool_policy, ensure_ascii=False) if body.tool_policy is not None else None,
            data_policy_json=json.dumps(body.data_policy, ensure_ascii=False) if body.data_policy is not None else None,
            deadline=body.deadline,
            created_by=body.created_by,
        )
        await self._repo.add_task(row)
        await self._apply_routing(row)
        transition(row, WorkTaskStatus.READY)
        await self._session.flush()
        await self._session.refresh(row)
        return self._to_response(row)

    async def patch_task(self, task_id: str, body: WorkTaskPatch) -> WorkTaskResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        data = body.model_dump(exclude_unset=True, by_alias=False)
        if "title" in data and data["title"] is not None:
            row.title = data["title"]
        if "description" in data:
            row.description = data["description"]
        if "task_type" in data and data["task_type"] is not None:
            row.task_type = _normalize_task_type(data["task_type"])
        if "priority" in data and data["priority"] is not None:
            row.priority = data["priority"]
        if "profile_id" in data:
            row.profile_id = data["profile_id"]
            row.assigned_profile_id = data["profile_id"]
        if "instance_id" in data:
            row.instance_id = data["instance_id"]
            row.assigned_instance_id = data["instance_id"]
        if "workspace_id" in data:
            row.workspace_id = data["workspace_id"]
        if "chat_run_id" in data:
            row.chat_run_id = data["chat_run_id"]
        if "instructions" in data:
            row.instructions = data["instructions"]
        if "payload" in data:
            row.payload_json = json.dumps(data["payload"], ensure_ascii=False) if data["payload"] is not None else None
        if "approval_policy" in data:
            row.approval_policy_json = (
                json.dumps(data["approval_policy"], ensure_ascii=False) if data["approval_policy"] is not None else None
            )
        if "workspace_policy" in data:
            row.workspace_policy_json = (
                json.dumps(data["workspace_policy"], ensure_ascii=False)
                if data["workspace_policy"] is not None
                else None
            )
        if "tool_policy" in data:
            row.tool_policy_json = (
                json.dumps(data["tool_policy"], ensure_ascii=False) if data["tool_policy"] is not None else None
            )
        if "data_policy" in data:
            row.data_policy_json = (
                json.dumps(data["data_policy"], ensure_ascii=False) if data["data_policy"] is not None else None
            )
        if "deadline" in data:
            row.deadline = data["deadline"]
        if "result_summary" in data:
            row.result_summary = data["result_summary"]
        await self._session.flush()
        return self._to_response(row)

    async def delete_task(self, task_id: str) -> None:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        if row.status in {
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.WAITING_APPROVAL.value,
            WorkTaskStatus.WAITING_INPUT.value,
            WorkTaskStatus.STARTING.value,
            WorkTaskStatus.VALIDATING.value,
        }:
            raise ConflictError("cannot delete an active work task")
        await self._session.delete(row)
        await self._session.flush()

    async def assign(self, task_id: str, body: WorkTaskAssignBody) -> WorkTaskResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        row.profile_id = body.profile_id
        row.assigned_profile_id = body.profile_id
        if body.instance_id is not None:
            row.instance_id = body.instance_id
            row.assigned_instance_id = body.instance_id
        await self._session.flush()
        return self._to_response(row)

    async def create_from_assignment(
        self,
        assignment: RemoteTaskAssignment,
        *,
        claim: bool = True,
    ) -> WorkTask:
        existing = await self._repo.get_task_by_assignment(assignment.assignment_id)
        if existing is not None:
            return existing

        profile_ref = {}
        try:
            profile_ref = json.loads(assignment.profile_ref_json or "{}")
        except json.JSONDecodeError:
            profile_ref = {}
        policies = {}
        try:
            policies = json.loads(assignment.policies_json or "{}")
        except json.JSONDecodeError:
            policies = {}

        profile_id = str(profile_ref.get("resourceId") or profile_ref.get("profileId") or "")
        row = WorkTask(
            source="remote_assignment",
            source_task_id=assignment.task_id,
            assignment_id=assignment.assignment_id,
            title=assignment.title,
            task_type=_normalize_task_type(assignment.task_type),
            priority=0,
            status=WorkTaskStatus.READY.value,
            profile_id=profile_id,
            assigned_profile_id=profile_id,
            instructions=assignment.instructions,
            approval_policy_json=json.dumps(policies.get("approvalPolicy") or {}, ensure_ascii=False),
            workspace_policy_json=json.dumps(policies.get("workspacePolicy") or {}, ensure_ascii=False),
            tool_policy_json=json.dumps(policies.get("toolPolicy") or {}, ensure_ascii=False),
            data_policy_json=json.dumps(policies.get("dataPolicy") or {}, ensure_ascii=False),
            payload_json=assignment.payload_json,
            deadline=assignment.deadline,
        )
        await self._repo.add_task(row)
        await self._apply_routing(row)
        assignment.work_task_id = row.id
        assignment.local_task_id = row.id

        if claim:
            await self._claim_assignment(assignment, row)

        return row

    async def _claim_assignment(self, assignment: RemoteTaskAssignment, task: WorkTask) -> None:
        cred = await self._enrollment.ensure_access_token()
        assignment.status = RemoteAssignmentStatus.CLAIMING.value
        transition(task, WorkTaskStatus.CLAIMING)
        lease_resp = await self._center.claim(assignment.assignment_id, endpoint_id=cred.endpoint_id)
        expires = _parse_dt(lease_resp.expires_at) or (datetime.now(UTC) + timedelta(seconds=assignment.lease_seconds))
        lease = TaskLease(
            assignment_row_id=assignment.id,
            assignment_id=assignment.assignment_id,
            lease_id=lease_resp.lease_id,
            expires_at=expires,
            heartbeat_interval_seconds=lease_resp.heartbeat_interval_seconds,
            status="active",
            work_task_id=task.id,
        )
        await self._sync.add_lease(lease)
        assignment.status = RemoteAssignmentStatus.CLAIMED.value
        transition(task, WorkTaskStatus.QUEUED)
        await self._session.flush()

    async def start(self, task_id: str) -> TaskStartResult:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        if row.status == WorkTaskStatus.MIGRATION_PENDING_REVIEW.value:
            raise ConflictError("task requires migration review")
        await self._apply_routing(row)
        try:
            if row.status in {
                WorkTaskStatus.DRAFT.value,
                WorkTaskStatus.READY.value,
                WorkTaskStatus.FAILED.value,
                WorkTaskStatus.INTERRUPTED.value,
            }:
                transition(row, WorkTaskStatus.QUEUED)
        except StateMachineError:
            if row.status not in {
                WorkTaskStatus.QUEUED.value,
                WorkTaskStatus.CLAIMING.value,
                WorkTaskStatus.STARTING.value,
                WorkTaskStatus.RUNNING.value,
                WorkTaskStatus.VALIDATING.value,
            }:
                raise

        # Already actively executing — return current run without re-queueing.
        if row.status in {
            WorkTaskStatus.RUNNING.value,
            WorkTaskStatus.VALIDATING.value,
            WorkTaskStatus.STARTING.value,
            WorkTaskStatus.WAITING_APPROVAL.value,
            WorkTaskStatus.WAITING_INPUT.value,
        }:
            return TaskStartResult(taskId=row.id, runId=row.active_run_id, status=row.status)

        runs = await self._repo.list_runs(row.id)
        run = TaskRun(
            task_id=row.id,
            run_number=len(runs) + 1,
            status="starting",
            chat_run_id=row.chat_run_id,
            gateway_instance_id=row.instance_id,
            started_at=datetime.now(UTC),
        )
        await self._repo.add_run(run)
        row.active_run_id = run.id
        if row.status != WorkTaskStatus.QUEUED.value:
            transition(row, WorkTaskStatus.QUEUED)

        await self._repo.add_queue_entry(
            TaskExecutionQueue(
                task_id=row.id,
                run_id=run.id,
                priority=row.priority,
                status="queued",
                available_at=datetime.now(UTC),
                attempt=0,
            )
        )
        await self._session.flush()

        mgr = TaskWorkerManager.get()
        if mgr._poll_task is None:
            # Workers disabled (tests / single-request path): execute in-process after enqueue.
            queue_row = await self._repo.get_queue_entry_for_run(run.id)
            if queue_row is not None:
                queue_row.status = "running"
                queue_row.claimed_by = "inline"
                queue_row.claimed_at = datetime.now(UTC)
            await self._executor().execute(row.id, run_id=run.id)
            await self._session.refresh(row)
            if queue_row is not None:
                if row.status in {WorkTaskStatus.COMPLETED.value, WorkTaskStatus.FINALIZING.value}:
                    queue_row.status = "completed"
                elif row.status == WorkTaskStatus.CANCELLED.value:
                    queue_row.status = "cancelled"
                elif row.status == WorkTaskStatus.FAILED.value:
                    queue_row.status = "failed"
                elif row.status in {
                    WorkTaskStatus.WAITING_APPROVAL.value,
                    WorkTaskStatus.WAITING_INPUT.value,
                }:
                    queue_row.status = "claimed"
            await self._session.flush()
            return TaskStartResult(taskId=row.id, runId=run.id, status=row.status)

        mgr.wake()
        return TaskStartResult(taskId=row.id, runId=run.id, status=WorkTaskStatus.QUEUED.value)

    async def cancel(self, task_id: str) -> WorkTaskResponse:
        row = await self._executor().cancel(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        await self._session.flush()
        await self._session.refresh(row)
        return self._to_response(row)

    async def retry(self, task_id: str) -> TaskStartResult:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        transition(row, WorkTaskStatus.QUEUED)
        return await self.start(task_id)

    async def _apply_routing(self, task: WorkTask) -> None:
        """Routing order: explicit assignment → task type rule → profile type → default."""
        if task.profile_id or task.assigned_profile_id:
            if task.profile_id and not task.assigned_profile_id:
                task.assigned_profile_id = task.profile_id
            return

        rule: RoutingRule | None = None
        db_rule = await self._repo.get_routing_rule(task.task_type)
        if db_rule is not None:
            rule = RoutingRule(profile_type=db_rule.profile_type, require_approval=db_rule.require_approval)
            if db_rule.profile_id:
                task.profile_id = db_rule.profile_id
                task.assigned_profile_id = db_rule.profile_id
                return
        if rule is None:
            rule = DEFAULT_TASK_ROUTING.get(task.task_type)
        if rule is None:
            rule = RoutingRule(profile_type="default", require_approval=False)

        profile = await ProfileRepository(self._session).get_first_by_type(rule.profile_type)
        if profile is not None:
            task.profile_id = profile.id
            task.assigned_profile_id = profile.id

    def _approval_to_response(self, row) -> TaskApprovalResponse:
        return TaskApprovalResponse(
            id=row.id,
            taskId=row.task_id,
            runId=row.run_id,
            toolCallId=row.tool_call_id,
            status=row.status,
            payload=_loads(row.payload_json),
            resolvedAt=row.resolved_at,
            createdAt=row.created_at,
        )

    def _artifact_to_response(self, row) -> TaskArtifactResponse:
        return TaskArtifactResponse(
            id=row.id,
            taskId=row.task_id,
            runId=row.run_id,
            artifactType=row.artifact_type,
            localPath=row.local_path,
            checksum=row.checksum,
            sizeBytes=row.size_bytes,
            contentType=row.content_type,
            uploadStatus=row.upload_status,
            remoteUrl=row.remote_url,
            createdAt=row.created_at,
        )

    def _interaction_to_response(self, row: TaskInteraction) -> TaskInteractionResponse:
        return TaskInteractionResponse(
            id=row.id,
            taskId=row.task_id,
            runId=row.run_id,
            interactionType=row.interaction_type,
            status=row.status,
            prompt=_loads(row.prompt_json),
            payload=_loads(row.payload_json),
            response=_loads(row.response_json),
            resolvedAt=row.resolved_at,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
        )

    def _run_to_response(self, row: TaskRun) -> TaskRunResponse:
        usage = _loads(row.usage_json)
        return TaskRunResponse(
            id=row.id,
            taskId=row.task_id,
            runNumber=row.run_number,
            status=row.status,
            chatRunId=row.chat_run_id,
            hermesSessionId=row.hermes_session_id,
            gatewayInstanceId=row.gateway_instance_id,
            leaseId=row.lease_id,
            startedAt=row.started_at,
            finishedAt=row.finished_at,
            exitReason=row.exit_reason,
            usage=usage,
            errorCode=row.error_code,
            errorDetail=row.error_detail,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
        )

    async def list_approvals(self, task_id: str) -> list[TaskApprovalResponse]:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        rows = await self._repo.list_approvals(task_id)
        return [self._approval_to_response(r) for r in rows]

    async def approve(self, task_id: str, approval_id: str) -> TaskApprovalResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        approval = await self._repo.get_approval(approval_id)
        if approval is None or approval.task_id != task_id:
            raise NotFoundError("approval not found")
        svc = TaskApprovalService(self._session)
        approved, _token = await svc.approve(approval_id, decided_by=None)
        await self._emit_interaction_event(
            task_id,
            approved.run_id or row.active_run_id or "",
            "task.approval.resolved",
            {"approvalId": approval_id, "decision": "approved"},
            assignment_id=row.assignment_id,
        )
        if row.status == WorkTaskStatus.WAITING_APPROVAL.value:
            await self._resume_after_interaction(row)
        return self._approval_to_response(approved)

    async def reject_approval(self, task_id: str, approval_id: str, *, reason: str | None = None) -> TaskApprovalResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        approval = await self._repo.get_approval(approval_id)
        if approval is None or approval.task_id != task_id:
            raise NotFoundError("approval not found")
        svc = TaskApprovalService(self._session)
        rejected = await svc.reject(approval_id, decided_by=None, reason=reason)
        await self._emit_interaction_event(
            task_id,
            rejected.run_id or row.active_run_id or "",
            "task.approval.resolved",
            {"approvalId": approval_id, "decision": "rejected", "reason": reason},
            assignment_id=row.assignment_id,
        )
        transition(row, WorkTaskStatus.FAILED)
        row.error_message = reason or "approval rejected"
        run = await self._repo.get_run(row.active_run_id) if row.active_run_id else None
        if run is not None:
            run.status = "failed"
            run.finished_at = datetime.now(UTC)
        await self._repo.release_locks(task_id)
        queue_row = await self._repo.get_queue_entry_for_run(run.id) if run else None
        if queue_row is not None:
            queue_row.status = "failed"
        return self._approval_to_response(rejected)

    async def list_interactions(self, task_id: str) -> list[TaskInteractionResponse]:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        rows = await self._repo.list_interactions(task_id)
        return [self._interaction_to_response(r) for r in rows]

    async def resolve_interaction(
        self,
        task_id: str,
        interaction_id: str,
        *,
        response: dict[str, Any] | None = None,
    ) -> TaskInteractionResponse:
        row = await self._repo.get_task(task_id)
        if row is None:
            raise NotFoundError("work task not found")
        interaction = await self._repo.get_interaction(interaction_id)
        if interaction is None or interaction.task_id != task_id:
            raise NotFoundError("interaction not found")
        if interaction.status != "pending":
            raise ConflictError("interaction is not pending")
        interaction.status = "resolved"
        interaction.response_json = json.dumps(response or {}, ensure_ascii=False)
        interaction.resolved_at = datetime.now(UTC)
        await self._emit_interaction_event(
            task_id,
            interaction.run_id or row.active_run_id or "",
            "task.input.resolved",
            {"interactionId": interaction_id, "response": response or {}},
            assignment_id=row.assignment_id,
        )
        if row.status == WorkTaskStatus.WAITING_INPUT.value:
            await self._resume_after_interaction(row)
        return self._interaction_to_response(interaction)

    async def _emit_interaction_event(
        self,
        task_id: str,
        run_id: str,
        event_type: str,
        payload: dict[str, Any],
        *,
        assignment_id: str | None = None,
    ) -> None:
        if not run_id:
            runs = await self._repo.list_runs(task_id)
            run_id = runs[-1].id if runs else task_id
        from runtime.tasks.event_store import TaskEventStore

        await TaskEventStore(self._settings, self._session).append(
            task_id=task_id,
            run_id=run_id,
            event_type=event_type,
            payload=payload,
            assignment_id=assignment_id,
        )

    async def _resume_after_interaction(self, task: WorkTask) -> None:
        run_id = task.active_run_id
        if not run_id:
            runs = await self._repo.list_runs(task.id)
            run_id = runs[-1].id if runs else None
        if run_id is None:
            raise ConflictError("no active run to resume")
        transition(task, WorkTaskStatus.QUEUED)
        queue_row = await self._repo.get_queue_entry_for_run(run_id)
        if queue_row is not None:
            queue_row.status = "queued"
            queue_row.available_at = datetime.now(UTC)
            queue_row.claimed_by = None
            queue_row.claimed_at = None
            queue_row.lease_expires_at = None
        else:
            await self._repo.add_queue_entry(
                TaskExecutionQueue(
                    task_id=task.id,
                    run_id=run_id,
                    priority=task.priority,
                    status="queued",
                    available_at=datetime.now(UTC),
                    attempt=0,
                )
            )
        mgr = TaskWorkerManager.get()
        mgr.wake()

    async def list_artifacts(self, task_id: str) -> list[TaskArtifactResponse]:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        rows = await self._repo.list_artifacts(task_id)
        return [self._artifact_to_response(r) for r in rows]

    async def get_artifact(self, task_id: str, artifact_id: str) -> TaskArtifactResponse:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        row = await self._repo.get_artifact(artifact_id)
        if row is None or row.task_id != task_id:
            raise NotFoundError("artifact not found")
        return self._artifact_to_response(row)

    async def open_artifact(self, task_id: str, artifact_id: str) -> dict[str, str]:
        artifact = await self.get_artifact(task_id, artifact_id)
        if not artifact.local_path:
            raise NotFoundError("artifact has no local path")
        return {"localPath": artifact.local_path}

    async def save_artifact_as(self, task_id: str, artifact_id: str, destination_path: str) -> dict[str, str]:
        row = await self._repo.get_artifact(artifact_id)
        if row is None or row.task_id != task_id:
            raise NotFoundError("artifact not found")
        if not row.local_path:
            raise NotFoundError("artifact has no local path")
        from pathlib import Path
        import shutil

        src = Path(row.local_path)
        dst = Path(destination_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return {"status": "copied", "destinationPath": str(dst)}

    async def get_snapshot(self, task_id: str) -> TaskSnapshotResponse:
        task = await self._repo.get_task(task_id)
        if task is None:
            raise NotFoundError("work task not found")
        active_run = None
        if task.active_run_id:
            run_row = await self._repo.get_run(task.active_run_id)
            if run_row is not None:
                active_run = self._run_to_response(run_row)
        events = [TaskEventResponse.model_validate(e) for e in await TaskEventService(self._session).list_events(task_id)]
        approvals = await self.list_approvals(task_id)
        interactions = await self.list_interactions(task_id)
        artifacts = await self.list_artifacts(task_id)
        queue_row = await self._repo.get_queue_entry_for_run(task.active_run_id) if task.active_run_id else None
        runtime_info = {
            "queueStatus": queue_row.status if queue_row else None,
            "activeRunId": task.active_run_id,
        }
        return TaskSnapshotResponse(
            task=self._to_response(task),
            activeRun=active_run,
            events=events,
            approvals=approvals,
            interactions=interactions,
            artifacts=artifacts,
            runtime=runtime_info,
        )

    async def ingest_team_assignment(self, hub: TeamHubClient, dto: RemoteAssignmentDTO) -> WorkTask | None:
        bindings = TeamTaskBindingRepository(self._session)
        existing_binding = await bindings.get_by_remote(dto.remote_task_id, dto.assignment_id)
        if existing_binding is not None:
            if existing_binding.work_task_id:
                return await self._repo.get_task(existing_binding.work_task_id)
            if existing_binding.local_task_id:
                shim = WorkTask(
                    source="team_hub",
                    source_task_id=dto.remote_task_id,
                    assignment_id=dto.assignment_id,
                    title=dto.title or "Untitled",
                    description=dto.description,
                    task_type=_normalize_task_type(dto.task_type),
                    priority=0,
                    status=WorkTaskStatus.READY.value,
                    workspace_id=dto.workspace_id,
                    legacy_source_id=existing_binding.local_task_id,
                    payload_json=json.dumps(dto.payload or {}, default=str),
                )
                await self._repo.add_task(shim)
                existing_binding.work_task_id = shim.id
                return shim

        claimed = await hub.claim_assignment(dto.remote_task_id, dto.assignment_id)
        if not claimed:
            return None

        row = WorkTask(
            source="team_hub",
            source_task_id=dto.remote_task_id,
            assignment_id=dto.assignment_id,
            title=dto.title or "Untitled",
            description=dto.description,
            task_type=_normalize_task_type(dto.task_type),
            priority=0,
            status=WorkTaskStatus.DRAFT.value,
            workspace_id=dto.workspace_id,
            payload_json=json.dumps(dto.payload or {}, default=str),
        )
        await self._repo.add_task(row)
        await self._apply_routing(row)
        transition(row, WorkTaskStatus.READY)

        binding = TeamTaskBinding(
            remote_task_id=dto.remote_task_id,
            assignment_id=dto.assignment_id,
            work_task_id=row.id,
            local_task_id=None,
            source_agent_id=dto.source_agent_id,
            target_agent_id=dto.target_agent_id,
            device_id=self._settings.device_id,
            sync_status=SyncBindingStatus.PENDING.value,
        )
        await bindings.create(binding)
        return row
