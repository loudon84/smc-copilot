"""Gateway crash recovery / crash loop / auth-no-restart (PRD v1.5 / v1.5.2)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import Settings
from core.runtime_enums import DesiredState, GatewayProcessState, InstanceStatus, OwnershipState
from integrations.hermes.client import GatewayHealthResult
from services.gateway_ownership_service import GatewayOwnershipResult
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


def _inst_base(**overrides: object) -> MagicMock:
    inst = MagicMock()
    inst.id = "inst-1"
    inst.profile_name = "default"
    inst.gateway_port = 8642
    inst.pid = 111
    inst.process_create_time = 1000.0
    inst.gateway_listener_pid = None
    inst.gateway_listener_create_time = None
    inst.gateway_launcher_pid = None
    inst.gateway_launcher_create_time = None
    inst.gateway_listener_executable_path = None
    inst.gateway_fingerprint_version = 1
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
    for k, v in overrides.items():
        setattr(inst, k, v)
    return inst


@pytest.mark.asyncio
async def test_auth_failure_does_not_auto_restart() -> None:
    # @lat: [[tests#Gateway recovery#Auth failure no restart]]
    settings = _settings(gateway_auto_recovery_enabled=True)
    inst = _inst_base()
    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)

    health = GatewayHealthResult(
        reachable=True,
        authenticated=False,
        healthy=False,
        status_code=401,
        source="/health",
        error_code="GATEWAY_AUTH_FAILED",
        latency_ms=1.0,
    )
    inspect = GatewayOwnershipResult(
        state=OwnershipState.OWNED,
        process_state=GatewayProcessState.ALIVE,
        pid=111,
        listener_pid=111,
        listener_alive=True,
        process_alive=True,
        health_authenticated=False,
        health=health,
        reason="tracked_handle",
    )

    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
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
    inst = _inst_base(
        id="inst-loop",
        pid=222,
        healthy=False,
        api_state="unreachable",
        restart_count=3,
        consecutive_health_successes=0,
        last_transition_at=datetime.now(UTC) - timedelta(seconds=10),
    )
    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)

    inspect = GatewayOwnershipResult(
        state=OwnershipState.STALE,
        process_state=GatewayProcessState.EXITED,
        pid=222,
        listener_alive=False,
        process_alive=False,
        reason="gone",
    )

    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
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
    inst = _inst_base(
        id="inst-cfg",
        pid=333,
        healthy=False,
        api_state="unreachable",
        process_state="exited",
        ownership_state="stale",
        consecutive_health_successes=0,
        last_error="bad config",
        last_error_code="configuration_invalid",
    )
    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    inspect = GatewayOwnershipResult(
        state=OwnershipState.STALE,
        process_state=GatewayProcessState.EXITED,
        pid=333,
        listener_alive=False,
        reason="gone",
    )

    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
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
    inst = _inst_base(
        id="inst-persisted",
        pid=None,
        process_create_time=None,
        status=InstanceStatus.ERROR.value,
        healthy=False,
        api_state="unreachable",
        process_state="exited",
        ownership_state="stale",
        consecutive_health_successes=0,
        restart_count=3,
        last_error="crash loop",
        last_error_code="GATEWAY_CRASH_LOOP",
        last_transition_at=datetime.now(UTC),
    )
    session_maker = _session_maker_for(inst)
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    inspect = GatewayOwnershipResult(
        state=OwnershipState.STALE,
        process_state=GatewayProcessState.EXITED,
        listener_alive=False,
        reason="gone",
    )

    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
        patch.object(svc, "_start_instance_unlocked", AsyncMock()) as start,
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        await svc.probe_and_recover("inst-persisted")
        start.assert_not_called()
