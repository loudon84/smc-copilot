from __future__ import annotations

import asyncio
import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.enums import OutboxStatus, TaskStatus
from core.logging import get_logger
from db.models.local_task import LocalTask
from db.models.task_related import SyncOutbox, TaskEvent
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import SyncOutboxRepository, TaskEventRepository, TaskRepository
from integrations.hermes.client_factory import HermesGatewayClientFactory
from integrations.team_hub.client import TeamHubClient
from services.gateway_supervisor import GatewaySupervisor
from services.task_routing_registry import TaskRoutingRegistry
from services.task_runtime import TaskRuntimeService
from services.task_state_machine import assert_transition_allowed

logger = get_logger(__name__)


class TaskListenerWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        supervisor: GatewaySupervisor,
        hub: TeamHubClient,
        routing: TaskRoutingRegistry,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._supervisor = supervisor
        self._hub = hub
        self._routing = routing

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("task_listener_tick_failed")
            await asyncio.sleep(self._settings.task_poll_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            runtime = TaskRuntimeService(session, self._settings, self._supervisor, self._routing)
            assignments = await self._hub.poll_assignments()
            for dto in assignments:
                await runtime.ingest_assignment(self._hub, dto)
            await session.commit()
        finally:
            await session.close()


class SyncOutboxWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        hub: TeamHubClient,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._hub = hub

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("sync_outbox_tick_failed")
            await asyncio.sleep(self._settings.sync_outbox_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            outbox_repo = SyncOutboxRepository(session)
            task_repo = TaskRepository(session)
            pending = await outbox_repo.list_pending(limit=100)
            for row in pending:
                try:
                    payload = json.loads(row.payload_json)
                    await self._hub.push_task_update(
                        {"outbox_id": row.id, "target_type": row.target_type, "event_type": row.event_type, **payload}
                    )
                    row.status = OutboxStatus.SENT.value
                    await outbox_repo.save(row)

                    if (
                        row.target_type == "local_task"
                        and row.event_type == "task_completed"
                        and row.target_id
                    ):
                        task = await task_repo.get(row.target_id)
                        if task and task.status == TaskStatus.COMPLETED.value:
                            assert_transition_allowed(task.status, TaskStatus.SYNCED.value)
                            task.status = TaskStatus.SYNCED.value
                            await task_repo.save(task)

                except Exception as e:
                    row.retry_count = row.retry_count + 1
                    row.last_error = str(e)
                    if row.retry_count >= self._settings.sync_outbox_max_retries:
                        row.status = OutboxStatus.FAILED.value
                    else:
                        row.status = OutboxStatus.PENDING.value
                    await outbox_repo.save(row)
            await session.commit()
        finally:
            await session.close()


class RunEventWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._fingerprints: dict[str, set[str]] = defaultdict(set)

    async def run_forever(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("run_event_tick_failed")
            await asyncio.sleep(self._settings.run_event_poll_interval_seconds)

    async def _tick(self) -> None:
        session = self._session_maker()
        try:
            result = await session.execute(
                select(LocalTask).where(
                    LocalTask.status == TaskStatus.RUNNING.value, LocalTask.hermes_run_id.is_not(None)
                )
            )
            tasks = list(result.scalars())
            erepo = TaskEventRepository(session)
            trepo = TaskRepository(session)
            profiles = ProfileRepository(session)
            outbox_repo = SyncOutboxRepository(session)
            for task in tasks:
                if not task.target_profile_id:
                    continue
                profile = await profiles.get_by_id(task.target_profile_id)
                if not profile:
                    continue
                hc = await HermesGatewayClientFactory(self._settings, session).create_for_profile_name(
                    profile.name,
                    profile.gateway_port,
                    require_key=False,
                )
                run_id = task.hermes_run_id
                if not run_id:
                    continue
                try:
                    data = await hc.get_run(run_id)
                    st = data.get("status") if isinstance(data.get("status"), str) else None
                    if st in {"completed", "success", "done"}:
                        assert_transition_allowed(task.status, TaskStatus.COMPLETED.value)
                        task.status = TaskStatus.COMPLETED.value
                        task.result_json = json.dumps(data)
                        task.finished_at = datetime.now(UTC)
                        await trepo.save(task)
                        await erepo.create(
                            TaskEvent(
                                task_id=task.id,
                                run_id=run_id,
                                event_type="hermes_completed",
                                message=st,
                                event_payload=json.dumps(data, default=str),
                            )
                        )
                        await outbox_repo.create(
                            SyncOutbox(
                                target_type="local_task",
                                target_id=task.id,
                                event_type="task_completed",
                                payload_json=json.dumps({"task_id": task.id}, default=str),
                                status=OutboxStatus.PENDING.value,
                            )
                        )
                    elif st in {"failed", "error"}:
                        assert_transition_allowed(task.status, TaskStatus.FAILED.value)
                        task.status = TaskStatus.FAILED.value
                        task.error_message = str(data.get("error", "Hermes failed"))
                        task.finished_at = datetime.now(UTC)
                        await trepo.save(task)
                        await erepo.create(
                            TaskEvent(
                                task_id=task.id,
                                run_id=run_id,
                                event_type="hermes_failed",
                                message=st,
                                event_payload=json.dumps(data, default=str),
                            )
                        )

                    events = await hc.list_run_events(run_id)
                    for raw in events:
                        fp = hashlib.sha256(json.dumps(raw, sort_keys=True, default=str).encode()).hexdigest()
                        fps = self._fingerprints[task.id]
                        if fp in fps:
                            continue
                        fps.add(fp)
                        if len(fps) > 2000:
                            fps.clear()
                        await erepo.create(
                            TaskEvent(
                                task_id=task.id,
                                run_id=run_id,
                                event_type="hermes_event",
                                event_payload=json.dumps(raw, default=str),
                            )
                        )
                except Exception:
                    logger.exception("run_event_collect_task_failed", task_id=task.id)
            await session.commit()
        finally:
            await session.close()
