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
async def test_profile_restart_endpoint_exists(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, supervisor, settings, _hub, _app = app_client
    port = 19601
    supervisor.set_mock_gateway_command(_mock_cmd(port))

    create_resp = await client.post(
        "/api/v1/profiles",
        json={
            "name": "writer-9601-test",
            "type": "writer",
            "gateway_port": port,
            "enabled": True,
            "auto_start": False,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    profile_id = create_resp.json()["id"]

    restart_resp = await client.post(f"/api/v1/profiles/{profile_id}/restart")
    assert restart_resp.status_code in (200, 503), restart_resp.text

    health_resp = await client.get(f"/api/v1/profiles/{profile_id}/health")
    assert health_resp.status_code == 200
    body = health_resp.json()
    assert body["profile_id"] == profile_id
    assert "healthy" in body
