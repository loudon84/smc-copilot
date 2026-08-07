from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

from services.gateway_supervisor import GatewaySupervisor

_ROOT = Path(__file__).resolve().parents[2]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "default"]


@pytest.mark.asyncio
async def test_profile_events_includes_start_audit(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, _settings, _hub, _app = app_client
    port = 19610
    supervisor.set_mock_gateway_command(_mock_cmd(port))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={"name": "writer-events-test", "type": "writer", "gateway_port": port},
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start_resp.status_code == 200, start_resp.text

    events_resp = await client.get(f"/api/v1/profiles/{profile_id}/events")
    assert events_resp.status_code == 200
    events = events_resp.json()
    actions = {e["event_type"] for e in events if e["source"] == "audit"}
    assert "profile_started" in actions


@pytest.mark.asyncio
async def test_profile_events_includes_task_events(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
    test_settings: object,
) -> None:
    from core.config import Settings
    from db.session import create_engine, create_sessionmaker

    client, *_ = app_client
    settings = test_settings if isinstance(test_settings, Settings) else None
    assert settings is not None

    profile_resp = await client.post(
        "/api/v1/profiles",
        json={"name": "task-events-profile", "type": "writer", "gateway_port": 19611},
    )
    profile_id = profile_resp.json()["id"]

    task_resp = await client.post(
        "/api/v1/tasks",
        json={"title": "t1", "task_type": "coding_task"},
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    bind_resp = await client.post(
        f"/api/v1/tasks/{task_id}/bind-profile",
        json={"profile_id": profile_id},
    )
    assert bind_resp.status_code == 200

    from db.models.task_related import TaskEvent
    from db.repositories.v12_repos import TaskEventRepository

    engine = create_engine(settings)
    session_maker = create_sessionmaker(engine)
    async with session_maker() as session:
        await TaskEventRepository(session).create(
            TaskEvent(task_id=task_id, event_type="task_created", message="ok")
        )
        await session.commit()
    await engine.dispose()

    events_resp = await client.get(f"/api/v1/profiles/{profile_id}/events")
    assert events_resp.status_code == 200
    types = {e["event_type"] for e in events_resp.json() if e["source"] == "task"}
    assert "task_created" in types
