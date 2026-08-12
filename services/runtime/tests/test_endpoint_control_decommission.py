"""RUNTIME-201: Endpoint Control decommission flag (Salt v2.2)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app import create_app
from core.config import Settings, get_settings


@pytest.fixture
def decommissioned_app(monkeypatch: pytest.MonkeyPatch, test_settings: Settings):
    test_settings.runtime_endpoint_control_enabled = False
    monkeypatch.setenv("SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED", "false")

    def _settings() -> Settings:
        return test_settings

    app = create_app()
    app.dependency_overrides[get_settings] = _settings
    return app


@pytest.mark.asyncio
async def test_endpoint_routes_return_410_when_decommissioned(decommissioned_app) -> None:
    transport = ASGITransport(app=decommissioned_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for path in (
            "/api/v1/endpoint/status",
            "/api/v1/bootstrap",
        ):
            resp = await client.get(path) if path.endswith("/status") else await client.post(path, json={})
            assert resp.status_code == 410, path
            body = resp.json()
            assert body["error"]["code"] == "runtime_endpoint_control_decommissioned"


@pytest.mark.asyncio
async def test_chat_health_still_200_when_decommissioned(decommissioned_app) -> None:
    transport = ASGITransport(app=decommissioned_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health = await client.get("/api/v1/health")
        assert health.status_code == 200
        assert "version" in health.json()


def test_endpoint_handlers_not_registered_when_decommissioned(test_settings: Settings) -> None:
    from unittest.mock import MagicMock

    from core.lifecycle import _register_runtime_handlers

    test_settings.runtime_endpoint_control_enabled = False
    job_service = MagicMock()
    _register_runtime_handlers(job_service, test_settings, MagicMock())
    job_service.register_handler.assert_not_called()
