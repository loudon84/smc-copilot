from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

from core.constants import GatewayStatus
from db.repositories.profile_repo import ProfileRepository
from services.gateway_supervisor import GatewaySupervisor

_ROOT = Path(__file__).resolve().parents[1]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int, profile: str) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", profile]


@pytest.mark.asyncio
async def test_create_profiles_get_distinct_ports(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client

    first = await client.post("/api/v1/profiles", json={"name": "default-v16", "type": "default"})
    second = await client.post("/api/v1/profiles", json={"name": "writer-v16", "type": "writer"})
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    port_a = first.json()["gateway_port"]
    port_b = second.json()["gateway_port"]
    assert port_a != port_b


@pytest.mark.asyncio
async def test_reconcile_keeps_untracked_running_gateway(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, settings, _hub, app = app_client
    port = 18810
    supervisor.set_mock_gateway_command(_mock_cmd(port, "reconcile-test"))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={"name": "reconcile-test", "type": "default", "gateway_port": port},
    )
    assert create_resp.status_code == 201
    profile_id = create_resp.json()["id"]

    start_resp = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start_resp.status_code == 200, start_resp.text

    session_maker = app.state.session_maker
    async with session_maker() as session:
        repo = ProfileRepository(session)
        profile = await repo.get_by_id(profile_id)
        assert profile is not None
        pid = profile.gateway_pid
        assert pid is not None

    supervisor._process_manager._handles.pop(profile_id, None)

    await supervisor.reconcile_on_boot()

    async with session_maker() as session:
        repo = ProfileRepository(session)
        profile = await repo.get_by_id(profile_id)
        assert profile is not None
        assert profile.status == GatewayStatus.RUNNING.value
        assert profile.gateway_pid == pid

    await supervisor.stop_profile(profile_id)


@pytest.mark.asyncio
async def test_service_status_endpoint(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client
    resp = await client.get("/api/v1/service/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["service"] == "HermesLocalService"
    assert "profiles" in body
    assert body["profiles"]["total"] >= 0
