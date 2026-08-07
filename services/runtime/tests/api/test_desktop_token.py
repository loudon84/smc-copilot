from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import create_app
from core.config import get_settings
from core.lifecycle import lifespan
from db.session import create_engine, create_sessionmaker, init_db
from integrations.team_hub.client import StubTeamHubClient
from runtime.gateway_process import GatewayProcessManager
from services.gateway_supervisor import GatewaySupervisor


@pytest_asyncio.fixture
async def token_required_client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    data = tmp_path / "token-data"
    data.mkdir()
    db_path = data / "test.db"
    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    monkeypatch.setenv("LOG_DIR", str(data / "logs"))
    monkeypatch.setenv("HERMES_HOME", str(data / "hermes"))
    (data / "hermes").mkdir()
    monkeypatch.setenv("DEFAULT_GATEWAY_PORT", "18742")
    monkeypatch.setenv("COPILOT_REQUIRE_TOKEN", "true")
    monkeypatch.setenv("COPILOT_DESKTOP_TOKEN", "test-desktop-token")
    monkeypatch.setenv("RUNTIME_ALLOW_LEGACY_TOKEN", "true")
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(data / "hermes-runtime"))
    (data / "hermes-runtime").mkdir(exist_ok=True)
    import core.config as config_mod

    config_mod._settings = None
    settings = get_settings()

    engine = create_engine(settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    process_manager = GatewayProcessManager(settings)
    supervisor = GatewaySupervisor(
        settings=settings,
        session_maker=session_maker,
        process_manager=process_manager,
    )
    stub_hub = StubTeamHubClient()

    app = create_app()
    app.state._test_engine = engine
    app.state._test_gateway_supervisor = supervisor
    app.state._test_team_hub = stub_hub
    app.state._disable_workers = True

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

    config_mod._settings = None


@pytest.mark.asyncio
async def test_tasks_require_token_when_enabled(token_required_client: AsyncClient) -> None:
    denied = await token_required_client.post(
        "/api/v1/tasks",
        json={"title": "no token", "task_type": "coding_task"},
    )
    assert denied.status_code == 401

    allowed = await token_required_client.post(
        "/api/v1/tasks",
        json={"title": "with token", "task_type": "coding_task"},
        headers={"X-Copilot-Desktop-Token": "test-desktop-token"},
    )
    assert allowed.status_code == 201


@pytest.mark.asyncio
async def test_health_public_without_token(token_required_client: AsyncClient) -> None:
    health = await token_required_client.get("/api/v1/health")
    assert health.status_code == 200
