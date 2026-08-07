from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app import create_app
from core.config import Settings, get_settings
from core.constants import GatewayStatus
from core.lifecycle import lifespan
from db.models.profile import Profile
from db.repositories.profile_repo import ProfileRepository
from db.session import create_engine, create_sessionmaker, init_db
from integrations.team_hub.client import StubTeamHubClient
from runtime.gateway_process import GatewayProcessManager
from services.gateway_supervisor import GatewaySupervisor
from utils.paths import profile_dir

_ROOT = Path(__file__).resolve().parents[1]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", "autostart-one"]


@pytest_asyncio.fixture
async def app_client_autostart(
    test_settings: Settings,
) -> AsyncIterator[tuple[AsyncClient, GatewaySupervisor, Settings, StubTeamHubClient, object]]:
    engine: AsyncEngine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)
    process_manager = GatewayProcessManager(test_settings)
    supervisor = GatewaySupervisor(
        settings=test_settings,
        session_maker=session_maker,
        process_manager=process_manager,
    )
    port = 18861
    supervisor.set_mock_gateway_command(_mock_cmd(port))

    async with session_maker() as session:
        repo = ProfileRepository(session)
        name = "autostart-one"
        profile = Profile(
            name=name,
            type="default",
            hermes_home=str(test_settings.hermes_home_path),
            profile_path=str(profile_dir(test_settings, name)),
            gateway_port=port,
            enabled=True,
            auto_start=True,
            status=GatewayStatus.STOPPED.value,
        )
        await repo.create(profile)
        await session.commit()
        profile_id = profile.id

    stub_hub = StubTeamHubClient()
    app = create_app()
    app.state._test_engine = engine
    app.state._test_gateway_supervisor = supervisor
    app.state._test_team_hub = stub_hub
    app.state._disable_workers = True
    app.state._disable_gateway_autostart = False

    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, supervisor, test_settings, stub_hub, app

        async with session_maker() as session:
            repo = ProfileRepository(session)
            row = await repo.get_by_id(profile_id)
            assert row is not None
            assert row.status == GatewayStatus.RUNNING.value

    import core.config as config_mod

    config_mod._settings = None


@pytest.mark.asyncio
async def test_lifespan_autostart_starts_profile(
    app_client_autostart: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    client, _supervisor, _settings, _hub, _app = app_client_autostart
    profiles = await client.get("/api/v1/profiles")
    assert profiles.status_code == 200
    running = [p for p in profiles.json() if p["name"] == "autostart-one"]
    assert len(running) == 1
    assert running[0]["status"] == GatewayStatus.RUNNING.value
