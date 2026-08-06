from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app import create_app
from core.config import Settings, get_settings
from core.lifecycle import lifespan
from db.session import create_engine, create_sessionmaker, init_db
from integrations.team_hub.client import StubTeamHubClient
from integrations.service_center.client import StubServiceCenterClient
from runtime.gateway_process import GatewayProcessManager
from services.gateway_supervisor import GatewaySupervisor


@pytest.fixture
def tmp_data_dir(tmp_path: Path) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    return data


@pytest.fixture
def test_settings(tmp_data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    db_path = tmp_data_dir / "test.db"
    log_dir = tmp_data_dir / "logs"
    hermes_home = tmp_data_dir / "hermes"
    hermes_home.mkdir()
    runtime_data = tmp_data_dir / "hermes-runtime"
    runtime_data.mkdir()
    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(runtime_data))
    monkeypatch.setenv("DEFAULT_GATEWAY_PORT", "18742")
    monkeypatch.setenv("RUNTIME_REQUIRE_AUTH", "false")
    monkeypatch.setenv("COPILOT_REQUIRE_TOKEN", "false")
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    monkeypatch.setenv("AIOS_SERVICE_CENTER_USE_STUB", "true")
    import core.config as config_mod

    config_mod._settings = None
    return get_settings()


@pytest_asyncio.fixture
async def app_client(
    test_settings: Settings,
) -> AsyncIterator[
    tuple[AsyncClient, GatewaySupervisor, Settings, StubTeamHubClient, object]
]:
    engine: AsyncEngine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    process_manager = GatewayProcessManager(test_settings)
    supervisor = GatewaySupervisor(
        settings=test_settings,
        session_maker=session_maker,
        process_manager=process_manager,
    )
    stub_hub = StubTeamHubClient()
    stub_center = StubServiceCenterClient()

    app = create_app()
    app.state._test_engine = engine
    app.state._test_gateway_supervisor = supervisor
    app.state._test_team_hub = stub_hub
    app.state._test_service_center = stub_center
    app.state._disable_workers = True
    app.state._disable_gateway_autostart = True
    app.state._skip_process_lock = True

    from runtime.tasks.registry import reset_task_scheduler, set_test_hermes_adapter
    from tests.support.mock_hermes_adapter import MockHermesRuntimeAdapter

    reset_task_scheduler()
    set_test_hermes_adapter(MockHermesRuntimeAdapter())

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, supervisor, test_settings, stub_hub, app

    import core.config as config_mod
    from runtime.tasks.registry import reset_task_scheduler, set_test_hermes_adapter

    set_test_hermes_adapter(None)
    reset_task_scheduler()
    config_mod._settings = None


@pytest_asyncio.fixture
async def enrolled_client(
    app_client: tuple[AsyncClient, GatewaySupervisor, Settings, StubTeamHubClient, object],
) -> AsyncIterator[tuple[AsyncClient, object, StubServiceCenterClient]]:
    client, _supervisor, _settings, _hub, app = app_client
    center: StubServiceCenterClient = app.state.service_center
    start = await client.post(
        "/api/v1/endpoint/enrollment/start",
        json={"enrollmentCode": "TEST-CODE-123"},
    )
    assert start.status_code == 200
    complete = await client.post(
        "/api/v1/endpoint/enrollment/complete",
        json={"enrollmentCode": "TEST-CODE-123", "enrollmentId": start.json()["enrollmentId"]},
    )
    assert complete.status_code == 200
    yield client, app, center
