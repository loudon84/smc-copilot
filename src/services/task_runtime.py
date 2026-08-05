from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.constants import GatewayStatus
from core.enums import SyncBindingStatus, TaskSource, TaskStatus
from core.errors import ConflictError, GatewayError, HermesClientError, NotFoundError
from db.models.local_task import LocalTask
from db.models.task_related import TaskEvent, TeamTaskBinding
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import (
    AuditRepository,
    TaskEventRepository,
    TaskRepository,
    TeamTaskBindingRepository,
)
from integrations.hermes.client import HermesGatewayClient, extract_run_id
from integrations.team_hub.client import TeamHubClient
from integrations.team_hub.dto import RemoteAssignmentDTO
from services.approval_service import ApprovalService
from services.gateway_supervisor import GatewaySupervisor
from services.task_routing_registry import TaskRoutingRegistry
from services.task_state_machine import assert_transition_allowed
from services.task_sync_service import TaskSyncService
from services.workspace_guard import WorkspaceGuard


# @lat: [[task-runtime#任务运行时]]
class TaskRuntimeService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        gateway_supervisor: GatewaySupervisor,
        routing_registry: TaskRoutingRegistry,
    ) -> None:
        self._session = session
        self._settings = settings
        self._gw = gateway_supervisor
        self._routing = routing_registry
        self._tasks = TaskRepository(session)
        self._events = TaskEventRepository(session)
        self._bindings = TeamTaskBindingRepository(session)
        self._profiles = ProfileRepository(session)
        self._audit = AuditRepository(session)
        self.sync_service = TaskSyncService(session)

    async def append_event(
        self,
        task_id: str,
        event_type: str,
        *,
        message: str | None = None,
        run_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> TaskEvent:
        ev = TaskEvent(
            task_id=task_id,
            run_id=run_id,
            event_type=event_type,
            message=message,
            event_payload=json.dumps(payload, default=str) if payload else None,
        )
        return await self._events.create(ev)

    async def create_local_task(
        self,
        *,
        title: str,
        task_type: str,
        payload: dict[str, Any] | None = None,
        workspace_id: str | None = None,
    ) -> LocalTask:
        task = LocalTask(
            title=title,
            task_type=task_type,
            source=TaskSource.LOCAL.value,
            status=TaskStatus.LOCAL_CREATED.value,
            workspace_id=workspace_id,
            payload_json=json.dumps(payload or {}, default=str),
        )
        await self._tasks.create(task)
        await self.append_event(
            task.id,
            "task_created",
            message="local",
            payload={"source": TaskSource.LOCAL.value, "status": task.status, "task_type": task_type},
        )
        await self._audit.log(action="task_created_local", actor=None, task_id=task.id, payload={"source": "local"})
        await self.sync_service.enqueue(
            target_type="local_task",
            target_id=task.id,
            event_type="task_created",
            payload={"task_id": task.id, "status": task.status},
        )
        await self.apply_routing(task.id)
        task2 = await self._tasks.get(task.id)
        assert task2 is not None
        return task2

    def _transition(self, task: LocalTask, target: TaskStatus | str) -> None:
        to_s = target.value if isinstance(target, TaskStatus) else target
        assert_transition_allowed(task.status, to_s)
        task.status = to_s

    async def ingest_assignment(self, hub: TeamHubClient, dto: RemoteAssignmentDTO) -> LocalTask | None:
        existing_binding = await self._bindings.get_by_remote(dto.remote_task_id, dto.assignment_id)
        if existing_binding:
            existing = await self._tasks.get(existing_binding.local_task_id)
            return existing

        claimed = await hub.claim_assignment(dto.remote_task_id, dto.assignment_id)
        if not claimed:
            return None

        task = LocalTask(
            title=dto.title or "Untitled",
            description=dto.description,
            task_type=dto.task_type,
            source=TaskSource.TEAM_HUB.value,
            remote_task_id=dto.remote_task_id,
            assignment_id=dto.assignment_id,
            workspace_id=dto.workspace_id,
            status=TaskStatus.LOCAL_CREATED.value,
            payload_json=json.dumps(dto.payload, default=str),
        )
        await self._tasks.create(task)

        binding = TeamTaskBinding(
            remote_task_id=dto.remote_task_id,
            assignment_id=dto.assignment_id,
            local_task_id=task.id,
            source_agent_id=dto.source_agent_id,
            target_agent_id=dto.target_agent_id,
            device_id=self._settings.device_id,
            sync_status=SyncBindingStatus.PENDING.value,
        )
        await self._bindings.create(binding)

        await self.append_event(
            task.id,
            "task_ingested",
            message="team_hub",
            payload={
                "remote_task_id": dto.remote_task_id,
                "assignment_id": dto.assignment_id,
                "status": task.status,
            },
        )

        await self._audit.log(
            action="task_ingested",
            actor=self._settings.agent_id,
            task_id=task.id,
            payload={"remote_task_id": dto.remote_task_id, "assignment_id": dto.assignment_id},
        )

        await self.sync_service.enqueue(
            target_type="local_task",
            target_id=task.id,
            event_type="task_created",
            payload={"task_id": task.id, "status": task.status},
        )

        await self.apply_routing(task.id)
        return task

    async def apply_routing(self, task_id: str) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        routing_map = self._routing.all_rules()
        rule = routing_map.get(task.task_type)
        if rule is None:
            from core.task_routing import RoutingRule

            rule = RoutingRule(profile_type="default", require_approval=False)
        profile = await self._profiles.get_first_by_type(rule.profile_type if rule else "default")  # type: ignore[union-attr]
        if profile:
            task.target_profile_id = profile.id
        if rule and rule.require_approval:
            self._transition(task, TaskStatus.WAITING_APPROVAL)
            await self._tasks.save(task)
            await self.append_event(
                task_id,
                "routing",
                message="waiting_approval_required",
                payload={"status": task.status, "require_approval": True},
            )
            approvals = ApprovalService(self._session, self._settings)
            await approvals.request_approval(
                task_id,
                action_type="task_execution",
                action_payload={"task_type": task.task_type},
                risk_level="high",
                requested_by=self._settings.agent_id,
            )
        else:
            self._transition(task, TaskStatus.APPROVED)
            await self._tasks.save(task)
            await self.append_event(
                task_id,
                "routing",
                message="approved_no_gate",
                payload={"status": task.status, "require_approval": False},
            )
        return task

    async def bind_profile(self, task_id: str, profile_id: str) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        profile = await self._profiles.get_by_id(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found")
        task.target_profile_id = profile_id
        await self._tasks.save(task)
        await self.append_event(task_id, "profile_bound", payload={"profile_id": profile_id})
        return task

    async def _ensure_workspace_allowed(self, task: LocalTask) -> None:
        if not task.workspace_id:
            return
        from db.repositories.v12_repos import WorkspaceRepository

        wrepo = WorkspaceRepository(self._session)
        ws = await wrepo.get(task.workspace_id)
        if ws is None or not ws.enabled:
            return
        guard = WorkspaceGuard()
        payload: dict[str, Any] = {}
        if task.payload_json:
            try:
                payload = json.loads(task.payload_json)
            except json.JSONDecodeError:
                payload = {}
        rel_path = payload.get("workspace_relative_path") or payload.get("path") or "."
        guard.validate_path_with_policy(ws.root_path, str(rel_path), ws.policy_json)

    async def _ensure_profile_gateway_ready(self, profile_id: str) -> None:
        profile = await self._profiles.get_by_id(profile_id)
        if profile is None:
            raise NotFoundError("Target profile missing")
        st = await self._gw.refresh_status(profile.id)
        if str(st.status) != GatewayStatus.RUNNING.value or not st.healthy:
            raise GatewayError(f"Profile {profile.name} gateway not ready ({st.status}); start profile first.")

    async def execute_run(self, task_id: str) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        if task.status != TaskStatus.APPROVED.value:
            raise ConflictError(f"Task not approved for run (status={task.status})")
        approvers = ApprovalService(self._session, self._settings)
        if await approvers.any_pending_for_task(task_id):
            raise ConflictError("Approval still pending")

        if not task.target_profile_id:
            raise ConflictError("No target_profile_id")

        await self._ensure_workspace_allowed(task)
        await self._ensure_profile_gateway_ready(task.target_profile_id)

        profile = await self._profiles.get_by_id(task.target_profile_id)
        assert profile is not None

        self._transition(task, TaskStatus.RUNNING)
        task.started_at = datetime.now(UTC)
        await self._tasks.save(task)
        await self.append_event(
            task_id,
            "task_running",
            message="execute_run",
            payload={"status": task.status, "profile_id": task.target_profile_id},
        )

        payload: dict[str, Any] = {}
        if task.payload_json:
            try:
                payload = json.loads(task.payload_json)
            except json.JSONDecodeError:
                payload = {}

        inp = payload.get("input", payload.get("prompt", ""))

        hc = HermesGatewayClient(profile.gateway_port)
        try:
            resp = await hc.create_run(model=payload.get("model"), input_payload=inp, metadata=payload.get("metadata"))
        except HermesClientError as e:
            self._transition(task, TaskStatus.FAILED)
            task.error_message = str(e.message)
            task.finished_at = datetime.now(UTC)
            await self._tasks.save(task)
            await self.append_event(
                task_id,
                "task_failed",
                message=str(e.message),
                payload={"status": task.status, "error": str(e.message)},
            )
            await self.sync_service.enqueue(
                target_type="local_task",
                target_id=task.id,
                event_type="task_failed",
                payload={"task_id": task.id},
            )
            raise

        run_id = extract_run_id(resp)
        task.hermes_run_id = run_id
        await self._tasks.save(task)
        await self.append_event(
            task.id,
            "hermes_run_created",
            message=run_id,
            run_id=run_id,
            payload={"run_id": run_id, "status": task.status},
        )

        raw_status = resp.get("status") if isinstance(resp.get("status"), str) else None
        if raw_status in {"completed", "success", "done"}:
            self._transition(task, TaskStatus.COMPLETED)
            task.result_json = json.dumps(resp)
            task.finished_at = datetime.now(UTC)
            await self._tasks.save(task)
            await self.append_event(
                task.id,
                "task_completed",
                message="execute_run_sync",
                run_id=run_id,
                payload={"status": task.status, "hermes_run_id": run_id},
            )
            await self.sync_service.enqueue(
                target_type="local_task",
                target_id=task.id,
                event_type="task_completed",
                payload={"task_id": task.id, "hermes_run_id": run_id},
            )
        elif raw_status in {"failed", "error"}:
            err_msg = str(resp.get("error", "Hermes reported failure"))
            self._transition(task, TaskStatus.FAILED)
            task.error_message = err_msg
            task.finished_at = datetime.now(UTC)
            await self._tasks.save(task)
            await self.append_event(
                task.id,
                "task_failed",
                message=err_msg,
                run_id=run_id,
                payload={"status": task.status, "error": err_msg, "hermes_run_id": run_id},
            )

        else:
            await self.sync_service.enqueue(
                target_type="local_task",
                target_id=task.id,
                event_type="task_running",
                payload={"task_id": task.id, "hermes_run_id": run_id},
            )

        return task

    async def mark_completed(self, task_id: str, *, result_json: str | None = None) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError("Task missing")
        self._transition(task, TaskStatus.COMPLETED)
        if result_json:
            task.result_json = result_json
        task.finished_at = datetime.now(UTC)
        await self._tasks.save(task)
        await self.append_event(
            task_id,
            "task_completed",
            message="mark_completed",
            run_id=task.hermes_run_id,
            payload={"status": task.status},
        )
        await self.sync_service.enqueue(
            target_type="local_task",
            target_id=task.id,
            event_type="task_completed",
            payload={"task_id": task.id},
        )
        return task

    async def mark_failed(self, task_id: str, message: str) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError("Task missing")
        self._transition(task, TaskStatus.FAILED)
        task.error_message = message
        task.finished_at = datetime.now(UTC)
        await self._tasks.save(task)
        await self.append_event(
            task_id,
            "task_failed",
            message=message,
            run_id=task.hermes_run_id,
            payload={"status": task.status, "error": message},
        )
        await self.sync_service.enqueue(
            target_type="local_task",
            target_id=task.id,
            event_type="task_failed",
            payload={"task_id": task.id},
        )
        return task

    async def cancel_task(self, task_id: str) -> LocalTask:
        task = await self._tasks.get(task_id)
        if task is None:
            raise NotFoundError("Task missing")
        if task.status == TaskStatus.RUNNING.value and task.hermes_run_id and task.target_profile_id:
            profile = await self._profiles.get_by_id(task.target_profile_id)
            if profile:
                try:
                    await HermesGatewayClient(profile.gateway_port).cancel_run(task.hermes_run_id)
                except HermesClientError:
                    pass
        self._transition(task, TaskStatus.CANCELLED)
        task.finished_at = datetime.now(UTC)
        await self._tasks.save(task)
        await self.append_event(
            task_id,
            "task_cancelled",
            message="cancel_task",
            run_id=task.hermes_run_id,
            payload={"status": task.status},
        )
        await self.sync_service.enqueue(
            target_type="local_task",
            target_id=task.id,
            event_type="task_cancelled",
            payload={"task_id": task.id},
        )
        return task

    async def list_local_tasks(self, *, limit: int = 200) -> list[LocalTask]:
        return await self._tasks.list_all(limit=limit)

    async def load_local_task(self, task_id: str) -> LocalTask | None:
        return await self._tasks.get(task_id)

    async def save_local_task(self, task: LocalTask) -> LocalTask:
        return await self._tasks.save(task)
