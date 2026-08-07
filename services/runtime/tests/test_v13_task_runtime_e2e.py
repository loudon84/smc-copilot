"""PRD v1.3 Phase 9 — WorkTask runtime integration E2E tests."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from core.enums import WorkTaskStatus
from db.models.work_tasks import TaskExecutionQueue, TaskRun, WorkTask
from db.repositories.work_task_repo import WorkTaskRepository
from runtime.tasks.executor import TaskExecutor
from runtime.tasks.registry import reset_task_scheduler, set_test_hermes_adapter
from runtime.tasks.task_recovery_service import TaskRecoveryService
from tests.support.scenario_hermes_adapter import ScenarioHermesRuntimeAdapter


@pytest.fixture
def scenario_adapter() -> ScenarioHermesRuntimeAdapter:
    reset_task_scheduler()
    adapter = ScenarioHermesRuntimeAdapter("happy")
    set_test_hermes_adapter(adapter)
    yield adapter
    set_test_hermes_adapter(None)
    reset_task_scheduler()


async def _create_assign_start(
    client: AsyncClient,
    *,
    title: str = "e2e-task",
    profile_id: str = "sales-expert",
    instructions: str = "analyze pipeline",
    approval_policy: dict | None = None,
    workspace_id: str | None = None,
) -> dict:
    body: dict = {
        "title": title,
        "taskType": "coding",
        "instructions": instructions,
        "profileId": profile_id,
    }
    if approval_policy is not None:
        body["approvalPolicy"] = approval_policy
    if workspace_id is not None:
        body["workspaceId"] = workspace_id
    created = await client.post("/api/v1/work-tasks", json=body)
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]
    assigned = await client.post(
        f"/api/v1/work-tasks/{task_id}/assign",
        json={"profileId": profile_id},
    )
    assert assigned.status_code == 200, assigned.text
    started = await client.post(f"/api/v1/work-tasks/{task_id}/start", json={})
    assert started.status_code in {200, 202}, started.text
    return {"taskId": task_id, "runId": started.json().get("runId"), "start": started.json()}


# @lat: [[tests#Work Task Runtime E2E#L1 happy path]]
@pytest.mark.asyncio
async def test_l1_happy_path_create_assign_start_completed(app_client, scenario_adapter) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    result = await _create_assign_start(client)
    task = await client.get(f"/api/v1/work-tasks/{result['taskId']}")
    assert task.status_code == 200
    payload = task.json()
    assert payload["status"] in {WorkTaskStatus.COMPLETED.value, WorkTaskStatus.FINALIZING.value}
    events = await client.get(f"/api/v1/work-tasks/{result['taskId']}/events")
    assert events.status_code == 200
    event_types = {e["eventType"] for e in events.json()}
    assert "task.started" in event_types
    assert "task.message.delta" in event_types or "agent.message.delta" in event_types
    assert "task.completed" in event_types


@pytest.mark.parametrize(
    ("scenario", "expected_status", "expected_event"),
    [
        ("message_delta", WorkTaskStatus.FINALIZING.value, "task.message.delta"),
        ("tool", WorkTaskStatus.FINALIZING.value, "task.tool.started"),
        ("usage", WorkTaskStatus.FINALIZING.value, "task.usage.updated"),
        (
            "approval",
            WorkTaskStatus.WAITING_APPROVAL.value,
            "task.approval.requested",
        ),
        ("fail", WorkTaskStatus.FAILED.value, "task.failed"),
        ("cancel", WorkTaskStatus.CANCELLED.value, "task.cancelled"),
    ],
)
# @lat: [[tests#Work Task Runtime E2E#L2 Fake Hermes scenarios]]
@pytest.mark.asyncio
async def test_l2_fake_hermes_scenarios(
    app_client,
    scenario: str,
    expected_status: str,
    expected_event: str,
) -> None:
    reset_task_scheduler()
    adapter = ScenarioHermesRuntimeAdapter(scenario)
    set_test_hermes_adapter(adapter)
    client, _supervisor, _settings, _hub, _app = app_client
    try:
        approval_policy = {"requireApproval": ["shell_exec"]} if scenario == "approval" else None
        result = await _create_assign_start(
            client,
            title=f"scenario-{scenario}",
            instructions=f"run-{scenario}",
            approval_policy=approval_policy,
        )
        task = await client.get(f"/api/v1/work-tasks/{result['taskId']}")
        assert task.status_code == 200
        assert task.json()["status"] == expected_status
        events = await client.get(f"/api/v1/work-tasks/{result['taskId']}/events")
        event_types = {e["eventType"] for e in events.json()}
        assert expected_event in event_types
    finally:
        set_test_hermes_adapter(None)
        reset_task_scheduler()


# @lat: [[tests#Work Task Runtime E2E#Queued entry survives recovery]]
@pytest.mark.asyncio
async def test_recovery_queued_entry_survives(app_client, scenario_adapter) -> None:
    _client, supervisor, settings, center, app = app_client
    session_maker = app.state.session_maker
    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="queued-recovery",
            task_type="coding_task",
            status=WorkTaskStatus.QUEUED.value,
            profile_id="sales-expert",
            instructions="wait",
        )
    )
    run = await repo.add_run(TaskRun(task_id=task.id, run_number=1, status="queued"))
    await repo.add_queue_entry(
        TaskExecutionQueue(
            task_id=task.id,
            run_id=run.id,
            priority=0,
            status="queued",
            available_at=datetime.now(UTC),
        )
    )
    await session.commit()
    task_id = task.id
    await session.close()

    session = session_maker()
    count = await TaskRecoveryService(settings, session, supervisor, center).recover_on_startup()
    await session.commit()
    repo = WorkTaskRepository(session)
    task = await repo.get_task(task_id)
    queue = await repo.get_queue_entry_for_run(run.id)
    assert task is not None
    assert task.status == WorkTaskStatus.QUEUED.value
    assert queue is not None
    assert queue.status == "queued"
    assert count >= 1
    await session.close()


# @lat: [[tests#Work Task Runtime E2E#Running interrupted on recovery]]
@pytest.mark.asyncio
async def test_recovery_running_interrupted_without_hermes_resend(app_client, scenario_adapter) -> None:
    _client, supervisor, settings, center, app = app_client
    session_maker = app.state.session_maker
    session = session_maker()
    repo = WorkTaskRepository(session)
    task = await repo.add_task(
        WorkTask(
            source="test",
            title="running-recovery",
            task_type="coding_task",
            status=WorkTaskStatus.RUNNING.value,
            profile_id="sales-expert",
            instructions="in-flight",
        )
    )
    run = await repo.add_run(TaskRun(task_id=task.id, run_number=1, status="running"))
    task.active_run_id = run.id
    await repo.add_queue_entry(
        TaskExecutionQueue(
            task_id=task.id,
            run_id=run.id,
            priority=0,
            status="running",
            available_at=datetime.now(UTC),
            claimed_by="worker-test",
            claimed_at=datetime.now(UTC),
        )
    )
    await session.commit()
    task_id = task.id
    run_id = run.id
    await session.close()

    session = session_maker()
    await TaskRecoveryService(settings, session, supervisor, center).recover_on_startup()
    await session.commit()
    repo = WorkTaskRepository(session)
    task = await repo.get_task(task_id)
    events = await repo.list_events(task_id)
    queue = await repo.get_queue_entry_for_run(run_id)
    assert task is not None
    assert task.status == WorkTaskStatus.INTERRUPTED.value
    assert queue is not None
    assert queue.status == "failed"
    assert any(e.event_type == "task.interrupted" for e in events)
    await session.close()


# @lat: [[tests#Work Task Runtime E2E#Resource lock exclusivity]]
@pytest.mark.asyncio
async def test_resource_lock_blocks_second_task_until_release(app_client, scenario_adapter) -> None:
    _client, supervisor, settings, center, app = app_client
    session_maker = app.state.session_maker
    workspace_id = "ws-lock-test"

    session = session_maker()
    repo = WorkTaskRepository(session)
    task_a = await repo.add_task(
        WorkTask(
            source="test",
            title="lock-a",
            task_type="coding",
            status=WorkTaskStatus.QUEUED.value,
            profile_id="sales-expert",
            workspace_id=workspace_id,
            instructions="a",
        )
    )
    task_b = await repo.add_task(
        WorkTask(
            source="test",
            title="lock-b",
            task_type="coding",
            status=WorkTaskStatus.QUEUED.value,
            profile_id="sales-expert",
            workspace_id=workspace_id,
            instructions="b",
        )
    )
    await session.commit()
    task_a_id = task_a.id
    task_b_id = task_b.id
    await session.close()

    session = session_maker()
    repo = WorkTaskRepository(session)
    executor = TaskExecutor(settings, session, center, supervisor)
    assert await executor.acquire_resource_lock(task_a_id, "workspace", workspace_id) is True
    assert await executor.acquire_resource_lock(task_b_id, "workspace", workspace_id) is False
    await repo.release_locks(task_a_id)
    await session.commit()
    assert await executor.acquire_resource_lock(task_b_id, "workspace", workspace_id) is True
    await session.close()


# @lat: [[tests#Work Task Runtime E2E#Snapshot API]]
@pytest.mark.asyncio
async def test_snapshot_api_returns_task_bundle(app_client, scenario_adapter) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    result = await _create_assign_start(client, title="snapshot-task")
    snap = await client.get(f"/api/v1/work-tasks/{result['taskId']}/snapshot")
    assert snap.status_code == 200
    body = snap.json()
    assert body["task"]["id"] == result["taskId"]
    assert "activeRun" in body or body.get("activeRun") is None
    assert isinstance(body.get("events"), list)
    assert isinstance(body.get("approvals"), list)
    assert isinstance(body.get("artifacts"), list)
