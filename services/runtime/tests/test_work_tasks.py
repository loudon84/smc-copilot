"""Work task execution tests (PRD v1.6 FR-401–507)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from core.enums import WorkTaskStatus
from db.models.work_tasks import TaskRun, WorkTask
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.event_store import INLINE_PAYLOAD_MAX_BYTES, TaskEventStore
from runtime.tasks.executor import TaskExecutor
from runtime.tasks.registry import reset_task_scheduler, set_test_hermes_adapter
from runtime.tasks.scheduler import TaskExecutionScheduler
from tests.fakes.service_center import sample_assignment
from tests.support.mock_hermes_adapter import MockHermesRuntimeAdapter


@pytest.fixture(autouse=True)
def _mock_hermes_adapter():
    reset_task_scheduler()
    adapter = MockHermesRuntimeAdapter()
    set_test_hermes_adapter(adapter)
    yield adapter
    set_test_hermes_adapter(None)
    reset_task_scheduler()


# @lat: [[tests#Work Task Execution#Event sequence uniqueness]]
@pytest.mark.asyncio
async def test_event_sequence_uniqueness(app_client) -> None:
    _client, supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker
    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="seq",
            task_type="coding_task",
            status=WorkTaskStatus.READY.value,
            profile_id="sales-expert",
            instructions="hello",
        )
    )
    run = await repo.add_run(TaskRun(task_id=task.id, run_number=1, status="running"))
    store = TaskEventStore(settings, session)
    await store.append(task_id=task.id, run_id=run.id, event_type="task.started", payload={"a": 1})
    await store.append(task_id=task.id, run_id=run.id, event_type="task.updated", payload={"b": 2})
    await session.commit()

    events = await repo.list_events_for_run(run.id)
    sequences = [e.sequence for e in events]
    assert sequences == [1, 2]
    assert len(sequences) == len(set(sequences))
    await session.close()


# @lat: [[tests#Work Task Execution#SSE replay from Last-Event-ID]]
@pytest.mark.asyncio
async def test_sse_replay_from_last_event_id(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_assignment(sample_assignment())
    await client.post("/api/v1/sync/now")

    listed = await client.get("/api/v1/remote-tasks")
    work_task_id = listed.json()[0].get("workTaskId")
    if not work_task_id:
        accepted = await client.post(f"/api/v1/remote-tasks/{listed.json()[0]['id']}/accept")
        work_task_id = accepted.json().get("workTaskId") or accepted.json().get("localTaskId")

    events = await client.get(f"/api/v1/work-tasks/{work_task_id}/events")
    assert events.status_code == 200
    all_events = events.json()
    assert any(e["eventType"] in {"agent.message.delta", "task.message.delta"} for e in all_events)

    if len(all_events) >= 2:
        mid_sequence = all_events[0]["sequence"]
        replay = await client.get(
            f"/api/v1/work-tasks/{work_task_id}/events",
            params={"after_sequence": mid_sequence},
        )
        replayed = replay.json()
        assert all(e["sequence"] > mid_sequence for e in replayed)


# @lat: [[tests#Work Task Execution#Cancel marks cancelled]]
@pytest.mark.asyncio
async def test_cancel_marks_cancelled(app_client) -> None:
    _client, supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker
    center = app.state.service_center
    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="cancel-me",
            task_type="coding",
            status=WorkTaskStatus.QUEUED.value,
            profile_id="sales-expert",
            instructions="hang",
        )
    )
    await session.commit()
    task_id = task.id
    await session.close()

    from services.work_task_service import WorkTaskService

    session = session_maker()
    svc = WorkTaskService(settings, session, center, supervisor)
    cancelled = await svc.cancel(task_id)
    await session.commit()
    assert cancelled.status == WorkTaskStatus.CANCELLED.value
    await session.close()


# @lat: [[endpoint-sync#Work Task Execution#Task Recovery]]
@pytest.mark.asyncio
async def test_recovery_marks_orphaned(app_client) -> None:
    _client, supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker
    center = app.state.service_center

    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="orphan",
            task_type="coding_task",
            status=WorkTaskStatus.RUNNING.value,
            profile_id="missing-profile",
            instructions="x",
        )
    )
    await repo.add_run(TaskRun(task_id=task.id, run_number=1, status="running"))
    task_id = task.id
    await session.commit()
    await session.close()

    from runtime.tasks.recovery import TaskRecovery

    session = session_maker()
    count = await TaskRecovery(settings, session, supervisor, center).recover_on_startup()
    await session.commit()
    assert count >= 1
    repo = WorkTaskRepository(session)
    task = await repo.get_task(task_id)
    assert task is not None
    assert task.status == WorkTaskStatus.INTERRUPTED.value
    await session.close()


# @lat: [[tests#Work Task Execution#Scheduler concurrency]]
@pytest.mark.asyncio
async def test_scheduler_concurrency() -> None:
    scheduler = TaskExecutionScheduler(endpoint_max=2, instance_max=1)
    await scheduler.enqueue("t1")
    await scheduler.enqueue("t2")
    await scheduler.enqueue("t3")
    assert await scheduler.try_acquire("t1", "inst-a") is True
    assert await scheduler.try_acquire("t2", "inst-a") is False
    assert await scheduler.try_acquire("t2", "inst-b") is True
    assert scheduler.active_endpoint_count() == 2
    await scheduler.release("inst-a")
    assert await scheduler.try_acquire("t3", "inst-a") is True


# @lat: [[tests#Work Task Execution#Executor uses Hermes adapter]]
@pytest.mark.asyncio
async def test_executor_uses_adapter_not_stub_text(app_client) -> None:
    _client, supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker
    center = app.state.service_center
    adapter = MockHermesRuntimeAdapter()

    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="exec",
            task_type="coding_task",
            status=WorkTaskStatus.READY.value,
            profile_id="sales-expert",
            instructions="analyze pipeline",
        )
    )
    await session.commit()

    executor = TaskExecutor(
        settings,
        session,
        center,
        supervisor,
        adapter=adapter,
        scheduler=TaskExecutionScheduler(endpoint_max=2, instance_max=1),
    )
    result = await executor.execute(task.id)
    await session.commit()

    assert result is not None
    assert result.status in {WorkTaskStatus.COMPLETED.value, WorkTaskStatus.FINALIZING.value}
    events = await repo.list_events(task.id)
    deltas = [e for e in events if e.event_type in {"agent.message.delta", "task.message.delta"}]
    assert deltas
    payload = json.loads(deltas[0].payload_json or "{}")
    assert "mock:" in str(payload.get("delta") or "")
    assert "completed via instance control plane" not in str(payload)
    await session.close()


# @lat: [[tests#Work Task Execution#Large payload becomes artifact]]
@pytest.mark.asyncio
async def test_large_event_payload_artifact(app_client) -> None:
    _client, _supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker
    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(WorkTask(source="test", title="big", task_type="t", status="running", profile_id="p"))
    run = await repo.add_run(TaskRun(task_id=task.id, run_number=1, status="running"))
    store = TaskEventStore(settings, session)
    big = {"data": "x" * INLINE_PAYLOAD_MAX_BYTES}
    event = await store.append(task_id=task.id, run_id=run.id, event_type="task.updated", payload=big)
    assert event.payload_artifact_id is not None
    await session.close()
