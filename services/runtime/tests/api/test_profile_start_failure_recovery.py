from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

from core.constants import GatewayStatus
from db.repositories.profile_repo import ProfileRepository
from schemas.profile import ProfileCreate
from services.gateway_supervisor import GatewaySupervisor
from services.profile_service import ProfileService

_ROOT = Path(__file__).resolve().parents[2]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int, profile: str = "default") -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", profile]


@pytest.mark.asyncio
async def test_start_failure_resets_starting_status(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, settings, _hub, app = app_client
    port = 19602
    supervisor.set_mock_gateway_command(
        [sys.executable, str(_ROOT / "scripts" / "does_not_exist_mock_gateway.py")]
    )

    session_maker = app.state.session_maker
    async with session_maker() as session:
        repo = ProfileRepository(session)
        svc = ProfileService(settings, repo)
        profile = await svc.create_profile(
            ProfileCreate(
                name="start-fail-test",
                gateway_port=port,
                enabled=True,
                auto_start=False,
            )
        )
        await session.commit()
        profile_id = profile.id

    start_resp = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start_resp.status_code == 503, start_resp.text

    async with session_maker() as session:
        repo = ProfileRepository(session)
        row = await repo.get_by_id(profile_id)
        assert row is not None
        assert row.status != GatewayStatus.STARTING.value

    events_resp = await client.get(f"/api/v1/profiles/{profile_id}/events")
    assert events_resp.status_code == 200
    events = events_resp.json()
    failed = [e for e in events if e.get("event_type") == "profile_start_failed"]
    assert len(failed) >= 1


@pytest.mark.asyncio
async def test_resolve_returns_starting_not_healthy(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    _client, _supervisor, settings, _hub, app = app_client
    session_maker = app.state.session_maker

    async with session_maker() as session:
        repo = ProfileRepository(session)
        svc = ProfileService(settings, repo)
        profile = await svc.create_profile(
            ProfileCreate(
                name="resolve-starting",
                gateway_port=19603,
                enabled=True,
                auto_start=False,
            )
        )
        profile = await svc.set_status(profile, GatewayStatus.STARTING)
        await session.commit()
        profile_id = profile.id

    resolve_resp = await _client.get("/api/v1/profiles/resolve", params={"ref": profile_id})
    assert resolve_resp.status_code == 200, resolve_resp.text
    body = resolve_resp.json()
    assert body["status"] == "starting"
    assert body["healthy"] is False


@pytest.mark.asyncio
async def test_stop_then_restart_succeeds(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, _settings, _hub, _app = app_client
    port = 19604
    supervisor.set_mock_gateway_command(_mock_cmd(port, "restart-cycle"))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "restart-cycle",
            "type": "default",
            "gateway_port": port,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    profile_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start_resp.status_code == 200, start_resp.text
    assert start_resp.json()["healthy"] is True

    stop_resp = await client.post(f"/api/v1/profiles/{profile_id}/stop")
    assert stop_resp.status_code == 200, stop_resp.text
    assert stop_resp.json()["status"] == "stopped"

    restart_resp = await client.post(f"/api/v1/profiles/{profile_id}/restart")
    assert restart_resp.status_code == 200, restart_resp.text
    assert restart_resp.json()["healthy"] is True

    health_resp = await client.get(f"/api/v1/profiles/{profile_id}/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["healthy"] is True
