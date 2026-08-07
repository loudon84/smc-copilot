from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

from core.constants import GatewayStatus
from db.repositories.profile_repo import ProfileRepository
from runtime.gateway_process import is_pid_alive
from schemas.profile import ProfileCreate
from services.gateway_supervisor import GatewaySupervisor
from services.profile_service import ProfileService

_ROOT = Path(__file__).resolve().parents[1]
_MOCK_SCRIPT = _ROOT / "scripts" / "mock_hermes_gateway.py"


def _mock_cmd(port: int, profile: str) -> list[str]:
    return [sys.executable, str(_MOCK_SCRIPT), "--port", str(port), "--profile", profile]


@pytest.mark.asyncio
async def test_shutdown_all_stops_untracked_running_gateway(
    app_client: tuple[AsyncClient, GatewaySupervisor, object, object, object],
) -> None:
    _client, supervisor, settings, _hub, app = app_client
    port = 18851
    supervisor.set_mock_gateway_command(_mock_cmd(port, "shutdown-orphan"))

    session_maker = app.state.session_maker
    async with session_maker() as session:
        repo = ProfileRepository(session)
        svc = ProfileService(settings, repo)
        profile = await svc.create_profile(
            ProfileCreate(name="shutdown-orphan", type="default", gateway_port=port, auto_start=False)
        )
        await session.commit()
        profile_id = profile.id

    await supervisor.start_profile(profile_id)

    async with session_maker() as session:
        repo = ProfileRepository(session)
        row = await repo.get_by_id(profile_id)
        assert row is not None
        pid = row.gateway_pid
        assert pid is not None
        assert row.status == GatewayStatus.RUNNING.value

    supervisor._process_manager._handles.pop(profile_id, None)
    assert is_pid_alive(pid)

    await supervisor.shutdown_all()
    assert not is_pid_alive(pid)

    async with session_maker() as session:
        repo = ProfileRepository(session)
        row = await repo.get_by_id(profile_id)
        assert row is not None
        assert row.status == GatewayStatus.STOPPED.value
        assert row.gateway_pid is None
