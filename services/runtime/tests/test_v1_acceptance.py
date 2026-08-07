from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parent.parent
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "default"]


@pytest.mark.asyncio
async def test_health(app_client) -> None:
    client, *_ = app_client
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_profile_list_and_create(app_client) -> None:
    client, _, settings, _, _ = app_client
    resp = await client.post(
        "/api/v1/profiles",
        json={"name": "default", "type": "default", "gateway_port": settings.default_gateway_port},
    )
    assert resp.status_code == 201
    profile = resp.json()
    assert profile["name"] == "default"
    assert profile["profile_path"] == str(settings.hermes_home_path)

    listed = await client.get("/api/v1/profiles")
    assert listed.status_code == 200
    assert len(listed.json()) >= 1


@pytest.mark.asyncio
async def test_start_profile_models_and_run(app_client) -> None:
    client, supervisor, settings, _, _ = app_client
    create = await client.post(
        "/api/v1/profiles",
        json={"name": "default", "gateway_port": settings.default_gateway_port},
    )
    profile_id = create.json()["id"]
    port = create.json()["gateway_port"]

    supervisor.set_mock_gateway_command(_mock_cmd(port))
    start = await client.post(f"/api/v1/profiles/{profile_id}/start")
    assert start.status_code == 200
    assert start.json()["status"] == "running"
    assert start.json()["healthy"] is True

    models = await client.get(f"/api/v1/profiles/{profile_id}/models")
    assert models.status_code == 200
    assert len(models.json()["models"]) >= 1

    run = await client.post(
        f"/api/v1/profiles/{profile_id}/runs",
        json={"input": "hello", "model": "mock-model"},
    )
    assert run.status_code == 200
    run_id = run.json()["run_id"]
    assert run_id

    get_run = await client.get(f"/api/v1/profiles/{profile_id}/runs/{run_id}")
    assert get_run.status_code == 200

    events = await client.get(f"/api/v1/profiles/{profile_id}/runs/{run_id}/events")
    assert events.status_code == 200
    assert len(events.json()["events"]) >= 1


@pytest.mark.asyncio
async def test_gateway_crash_detected(app_client) -> None:
    client, supervisor, settings, _, _ = app_client
    create = await client.post(
        "/api/v1/profiles",
        json={"name": "crash-test", "gateway_port": settings.default_gateway_port + 1},
    )
    profile_id = create.json()["id"]
    port = create.json()["gateway_port"]

    supervisor.set_mock_gateway_command(_mock_cmd(port))
    await client.post(f"/api/v1/profiles/{profile_id}/start")

    handle = supervisor._process_manager.get_handle(profile_id)
    assert handle is not None
    if handle.process:
        handle.process.kill()
        await handle.process.wait()

    status = await client.get(f"/api/v1/profiles/{profile_id}/status")
    assert status.status_code == 200
    body = status.json()
    assert body["status"] in ("error", "stopped")
    assert body["healthy"] is False


@pytest.mark.asyncio
async def test_gateway_logs(app_client) -> None:
    client, supervisor, settings, _, _ = app_client
    create = await client.post(
        "/api/v1/profiles",
        json={"name": "logs-test", "gateway_port": settings.default_gateway_port + 2},
    )
    profile_id = create.json()["id"]
    port = create.json()["gateway_port"]
    supervisor.set_mock_gateway_command(_mock_cmd(port))
    await client.post(f"/api/v1/profiles/{profile_id}/start")

    logs = await client.get(f"/api/v1/gateways/{profile_id}/logs")
    assert logs.status_code == 200
    assert "lines" in logs.json()


@pytest.mark.asyncio
async def test_gateway_health_endpoint(app_client) -> None:
    client, supervisor, settings, _, _ = app_client
    create = await client.post(
        "/api/v1/profiles",
        json={"name": "health-test", "gateway_port": settings.default_gateway_port + 3},
    )
    profile_id = create.json()["id"]
    port = create.json()["gateway_port"]
    supervisor.set_mock_gateway_command(_mock_cmd(port))
    await client.post(f"/api/v1/profiles/{profile_id}/start")

    health = await client.get(f"/api/v1/gateways/{profile_id}/health")
    assert health.status_code == 200
    assert health.json()["healthy"] is True
