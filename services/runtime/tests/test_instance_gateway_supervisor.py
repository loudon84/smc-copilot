"""Instance gateway supervisor tests (v1.3.1 FR-05)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from core.runtime_enums import InstanceStatus
from db.models.runtime import HermesInstance, RuntimeVersion
from db.session import create_sessionmaker


@pytest.mark.asyncio
async def test_instance_start_does_not_call_start_profile(app_client, monkeypatch: pytest.MonkeyPatch) -> None:
    client, supervisor, settings, _hub, app = app_client
    called = {"start_profile": False}

    original = supervisor.start_profile

    async def tracking_start_profile(profile_id: str):
        called["start_profile"] = True
        return await original(profile_id)

    monkeypatch.setattr(supervisor, "start_profile", tracking_start_profile)

    # Seed runtime version + instance
    session_maker = create_sessionmaker(app.state.engine)
    async with session_maker() as session:
        ver = RuntimeVersion(
            version="0.19.0-test",
            channel="stable",
            install_path=str(settings.resolved_runtime_data_dir() / "versions" / "0.19.0"),
            executable_path=sys.executable,
            status="active",
        )
        session.add(ver)
        await session.flush()
        inst = HermesInstance(
            name="gw-test",
            profile_name="default",
            runtime_version_id=ver.id,
            gateway_port=19801,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id

    # Mock gateway command so start can succeed without real hermes
    mock_script = Path(__file__).resolve().parents[1] / "scripts" / "mock_hermes_gateway.py"
    if mock_script.exists():
        supervisor.set_mock_gateway_command(
            [sys.executable, str(mock_script), "--port", "19801", "--host", "127.0.0.1"]
        )

    resp = await client.post(f"/api/v1/instances/{instance_id}/start")
    # May succeed with mock or fail health — either way must not use start_profile
    assert called["start_profile"] is False
    if resp.status_code == 200:
        body = resp.json()
        assert body["id"] == instance_id
        await client.post(f"/api/v1/instances/{instance_id}/stop")


@pytest.mark.asyncio
async def test_instance_health_fields(app_client) -> None:
    client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)
    async with session_maker() as session:
        ver = RuntimeVersion(
            version="0.19.0",
            channel="stable",
            install_path="/tmp",
            executable_path=sys.executable,
            status="active",
        )
        session.add(ver)
        await session.flush()
        inst = HermesInstance(
            name="health-test",
            profile_name="default",
            runtime_version_id=ver.id,
            gateway_port=19802,
            status=InstanceStatus.STOPPED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id

    resp = await client.get(f"/api/v1/instances/{instance_id}/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "profileName" in body
    assert "runtimeVersion" in body
    assert "executableVerified" in body or body.get("executableVerified") is not None
    assert "apiServerEnabled" in body or "apiServerEnabled" in str(body)
    assert "API_SERVER_KEY" not in body
    assert body.get("lastError") is None or isinstance(body.get("lastError"), (str, type(None)))
