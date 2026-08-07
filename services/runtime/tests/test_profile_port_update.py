from __future__ import annotations

import pytest
from httpx import AsyncClient

from services.gateway_supervisor import GatewaySupervisor


@pytest.mark.asyncio
async def test_update_profile_gateway_port_conflict(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client

    first = await client.post(
        "/api/v1/profiles",
        json={"name": "port-owner-a", "type": "default", "gateway_port": 18821},
    )
    second = await client.post(
        "/api/v1/profiles",
        json={"name": "port-owner-b", "type": "writer", "gateway_port": 18822},
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    second_id = second.json()["id"]
    conflict = await client.patch(
        f"/api/v1/profiles/{second_id}",
        json={"gateway_port": 18821},
    )
    assert conflict.status_code == 409, conflict.text
