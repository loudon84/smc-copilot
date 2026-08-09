"""Gateway crash recovery / crash loop / auth-no-restart (PRD v1.5 §81–83)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import Settings
from core.runtime_enums import DesiredState, InstanceStatus, OwnershipState
from integrations.hermes.client import GatewayHealthResult
from runtime.gateway_process import OwnershipResult
from services.instance_gateway_service import InstanceGatewayService, _restart_timestamps


@pytest.fixture(autouse=True)
def _clear_restart_budget() -> None:
    _restart_timestamps.clear()
    yield
    _restart_timestamps.clear()


def _settings(**overrides: object) -> Settings:
    s = Settings()
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def _session_maker_for(inst: MagicMock) -> MagicMock:
    session_maker = MagicMock()
    session = AsyncMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=inst)
    session.commit = AsyncMock()
    return session_maker


@pytest.mark.asyncio
async def test_auth_failure_does_not_auto_restart() -> None:
    # @lat: [[tests#Gateway recovery#Auth failure no restart]]
    settings = _settings(gateway_auto_recovery_enabled=True)
    inst = MagicMock()
    inst.id = "inst-1"
    inst.profile_name = "default"
    inst.gateway_port = 8642
    inst.pid = 111
    inst.process_create_time = 1000.0
    inst.desired_state = DesiredState.RUNNING.value
    inst.status = InstanceStatus.RUNNING.value
    inst.healthy = True
    inst.api_state = "healthy"
    inst.process_state = "alive"
    inst.ownership_state = "owned"
    inst.consecutive_health_failures = 0
    inst.consecutive_health_successes = 2
    inst.restart_count = 0
    inst.last_error = None
    inst.last_error_code = None
    inst.runtime_version_id = None
    inst.last_transition_at = None

    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)

    ownership = OwnershipResult(state=OwnershipState.OWNED)
    health = GatewayHealthResult(
        reachable=True,
        authenticated=False,
        healthy=False,
        status_code=401,
        source="/health",
        error_code="GATEWAY_AUTH_FAILED",
        latency_ms=1.0,
    )

    with (
        patch.object(svc, "_ownership_for", return_value=ownership),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
        patch.object(svc, "_client_for") as client_for,
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
        patch("services.instance_gateway_service.is_pid_alive", return_value=True),
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        client = MagicMock()
        client.health_check = AsyncMock(return_value=health)
        client_for.return_value = client

        await svc.probe_and_recover("inst-1")
        start.assert_not_called()
        assert inst.api_state == "unauthorized"
        assert inst.healthy is False
        assert inst.last_error_code == "GATEWAY_AUTH_FAILED"


@pytest.mark.asyncio
async def test_crash_loop_stops_auto_restart() -> None:
    # @lat: [[tests#Gateway recovery#Crash loop]]
    settings = _settings(
        gateway_auto_recovery_enabled=True,
        gateway_max_restarts=3,
        gateway_restart_window_seconds=300,
    )
    inst = MagicMock()
    inst.id = "inst-loop"
    inst.profile_name = "default"
    inst.gateway_port = 8642
    inst.pid = 222
    inst.process_create_time = 1000.0
    inst.desired_state = DesiredState.RUNNING.value
    inst.status = InstanceStatus.RUNNING.value
    inst.healthy = False
    inst.api_state = "unreachable"
    inst.process_state = "alive"
    inst.ownership_state = "owned"
    inst.consecutive_health_failures = 0
    inst.consecutive_health_successes = 0
    # Budget exhausted in DB (survives Runtime restart)
    inst.restart_count = 3
    inst.last_error = None
    inst.last_error_code = None
    inst.runtime_version_id = None
    inst.last_transition_at = datetime.now(UTC) - timedelta(seconds=10)

    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)

    stale = OwnershipResult(state=OwnershipState.STALE, error_code="GATEWAY_PROCESS_STALE", detail="gone")

    with (
        patch.object(svc, "_ownership_for", return_value=stale),
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
        patch("services.instance_gateway_service.is_pid_alive", return_value=False),
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        await svc.probe_and_recover("inst-loop")
        start.assert_not_called()
        assert inst.last_error_code == "GATEWAY_CRASH_LOOP"


@pytest.mark.asyncio
async def test_configuration_invalid_blocks_auto_restart() -> None:
    # @lat: [[tests#Gateway recovery#Config invalid no restart]]
    settings = _settings(gateway_auto_recovery_enabled=True)
    inst = MagicMock()
    inst.id = "inst-cfg"
    inst.profile_name = "default"
    inst.gateway_port = 8642
    inst.pid = 333
    inst.process_create_time = 1000.0
    inst.desired_state = DesiredState.RUNNING.value
    inst.status = InstanceStatus.RUNNING.value
    inst.healthy = False
    inst.api_state = "unreachable"
    inst.process_state = "exited"
    inst.ownership_state = "stale"
    inst.consecutive_health_failures = 0
    inst.consecutive_health_successes = 0
    inst.restart_count = 0
    inst.last_error = "bad config"
    inst.last_error_code = "configuration_invalid"
    inst.runtime_version_id = None
    inst.last_transition_at = None

    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    stale = OwnershipResult(state=OwnershipState.STALE, error_code="GATEWAY_PROCESS_STALE", detail="gone")

    with (
        patch.object(svc, "_ownership_for", return_value=stale),
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        await svc.probe_and_recover("inst-cfg")
        start.assert_not_called()
        assert inst.last_error_code == "configuration_invalid"


@pytest.mark.asyncio
async def test_persisted_crash_loop_blocks_after_runtime_restart() -> None:
    """GATEWAY_CRASH_LOOP in DB must block restart even with empty in-memory budget."""
    settings = _settings(gateway_auto_recovery_enabled=True, gateway_max_restarts=3)
    inst = MagicMock()
    inst.id = "inst-persisted"
    inst.profile_name = "default"
    inst.gateway_port = 8642
    inst.pid = None
    inst.process_create_time = None
    inst.desired_state = DesiredState.RUNNING.value
    inst.status = InstanceStatus.ERROR.value
    inst.healthy = False
    inst.api_state = "unreachable"
    inst.process_state = "exited"
    inst.ownership_state = "stale"
    inst.consecutive_health_failures = 0
    inst.consecutive_health_successes = 0
    inst.restart_count = 3
    inst.last_error = "crash loop"
    inst.last_error_code = "GATEWAY_CRASH_LOOP"
    inst.runtime_version_id = None
    inst.last_transition_at = datetime.now(UTC)

    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    stale = OwnershipResult(state=OwnershipState.STALE, error_code="GATEWAY_PROCESS_STALE", detail="gone")

    with (
        patch.object(svc, "_ownership_for", return_value=stale),
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        await svc.probe_and_recover("inst-persisted")
        start.assert_not_called()
