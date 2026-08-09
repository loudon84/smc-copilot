"""PRD v1.5.2 Gateway launcher/listener identity + ownership SOT regression tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import Settings
from core.runtime_enums import DesiredState, GatewayProcessState, InstanceStatus, OwnershipState
from integrations.hermes.client import GatewayHealthResult
from runtime.gateway_listener import verify_lineage
from runtime.gateway_process import OwnershipResult
from services.gateway_ownership_service import GatewayOwnershipResult, GatewayOwnershipService
from services.instance_gateway_service import InstanceGatewayService


def _settings(**overrides: object) -> Settings:
    s = Settings()
    s.deployment_mode = "development_stub"
    s.gateway_dev_allow_safe_adoption = True
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def _health_ok() -> GatewayHealthResult:
    return GatewayHealthResult(
        reachable=True,
        authenticated=True,
        healthy=True,
        status_code=200,
        source="/health",
    )


def _inst(**overrides: object) -> MagicMock:
    inst = MagicMock()
    inst.id = "i1"
    inst.pid = None
    inst.process_create_time = None
    inst.gateway_port = 8642
    inst.profile_name = "default"
    inst.gateway_executable_path = "C:/hermes.exe"
    inst.gateway_command_hash = None
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
    inst.last_error = None
    inst.last_error_code = None
    for k, v in overrides.items():
        setattr(inst, k, v)
    return inst


def test_lineage_same_process() -> None:
    # @lat: [[tests#Gateway listener identity v152#Same process]]
    assert verify_lineage(100, 100) is True


def test_lineage_child(monkeypatch: pytest.MonkeyPatch) -> None:
    # @lat: [[tests#Gateway listener identity v152#Child listener]]
    child = MagicMock()
    child.pid = 13500
    parent = MagicMock()
    parent.children.return_value = [child]

    class _Proc:
        def __init__(self, pid: int) -> None:
            if pid == 12000:
                self._p = parent
            else:
                raise Exception("no")

        def children(self, recursive: bool = False):
            return self._p.children(recursive=recursive)

    with patch("runtime.gateway_listener.is_pid_alive", return_value=True), patch(
        "runtime.gateway_listener.psutil.Process", side_effect=_Proc
    ):
        assert verify_lineage(12000, 13500) is True


@pytest.mark.asyncio
async def test_same_process_gateway_owned() -> None:
    # @lat: [[tests#Gateway listener identity v152#Same process owned]]
    svc = GatewayOwnershipService(_settings())
    inst = _inst(gateway_listener_pid=100, gateway_listener_create_time=1.0, gateway_fingerprint_version=2)
    owned = OwnershipResult(state=OwnershipState.OWNED)
    with (
        patch("services.gateway_ownership_service.verify_ownership", return_value=owned),
        patch("services.gateway_ownership_service.is_pid_alive", return_value=True),
        patch("services.gateway_ownership_service.find_pids_listening_on_port", return_value=[100]),
        patch.object(svc, "_cmdline", return_value=["hermes", "gateway", "run"]),
        patch.object(svc, "_exe", return_value="C:/hermes.exe"),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client_cls.return_value.health_check = AsyncMock(return_value=_health_ok())
        result = await svc.inspect(inst, tracked_alive=True, api_key="x")
    assert result.state == OwnershipState.OWNED
    assert result.process_state == GatewayProcessState.ALIVE
    assert result.listener_pid == 100


@pytest.mark.asyncio
async def test_child_listener_owned_via_legacy_upgrade() -> None:
    # @lat: [[tests#Gateway listener identity v152#Child listener owned]]
    svc = GatewayOwnershipService(_settings())
    # Legacy: launcher pid stored, listener is child on port
    inst = _inst(pid=12000, process_create_time=1.0, gateway_fingerprint_version=1)
    foreign = OwnershipResult(
        state=OwnershipState.FOREIGN,
        detail="port owned by other pid(s): [13500]",
        error_code="GATEWAY_PORT_OWNERSHIP_CONFLICT",
    )
    with (
        patch("services.gateway_ownership_service.verify_ownership", return_value=foreign),
        patch("services.gateway_ownership_service.is_pid_alive", return_value=True),
        patch(
            "services.gateway_ownership_service.find_pids_listening_on_port",
            return_value=[13500],
        ),
        patch("services.gateway_ownership_service.verify_lineage", return_value=True),
        patch.object(svc, "_cmdline", return_value=["python", "-m", "hermes", "gateway", "run"]),
        patch.object(svc, "_exe", return_value="C:/Python/python.exe"),
        patch.object(svc, "_hermes_environment_match", return_value=True),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
        patch("services.gateway_ownership_service.psutil.Process") as proc_cls,
    ):
        proc = MagicMock()
        proc.create_time.return_value = 1.5
        proc_cls.return_value = proc
        client_cls.return_value.health_check = AsyncMock(return_value=_health_ok())
        result = await svc.inspect(inst, expected_executable="C:/hermes.exe", api_key="x")
    assert result.state in (OwnershipState.ADOPTED, OwnershipState.OWNED)
    assert result.listener_pid == 13500
    assert result.upgrade_to_v2 is True


@pytest.mark.asyncio
async def test_launcher_dead_listener_alive_adopted() -> None:
    # @lat: [[tests#Gateway listener identity v152#Launcher exits]]
    svc = GatewayOwnershipService(_settings())
    inst = _inst(
        gateway_launcher_pid=12000,
        gateway_listener_pid=13500,
        gateway_listener_create_time=1.8,
        gateway_fingerprint_version=2,
        pid=13500,
        process_create_time=1.8,
    )
    owned = OwnershipResult(state=OwnershipState.OWNED)
    with (
        patch("services.gateway_ownership_service.verify_ownership", return_value=owned),
        patch("services.gateway_ownership_service.is_pid_alive", side_effect=lambda pid: pid == 13500),
        patch(
            "services.gateway_ownership_service.find_pids_listening_on_port",
            return_value=[13500],
        ),
        patch.object(svc, "_cmdline", return_value=["python", "gateway", "run"]),
        patch.object(svc, "_exe", return_value="C:/Python/python.exe"),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client_cls.return_value.health_check = AsyncMock(return_value=_health_ok())
        result = await svc.inspect(inst, tracked_alive=False, api_key="x")
    assert result.state == OwnershipState.ADOPTED
    assert result.process_state == GatewayProcessState.ALIVE
    assert result.listener_alive is True


@pytest.mark.asyncio
async def test_health_worker_preserves_adoption() -> None:
    # @lat: [[tests#Gateway listener identity v152#Worker preserves adoption]]
    settings = _settings()
    inst = _inst(
        ownership_state=OwnershipState.ADOPTED.value,
        gateway_listener_pid=13500,
        gateway_listener_create_time=1.0,
        pid=13500,
        process_create_time=1.0,
        gateway_fingerprint_version=2,
    )
    session_maker = MagicMock()
    session = AsyncMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=inst)
    session.commit = AsyncMock()
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)

    inspect = GatewayOwnershipResult(
        state=OwnershipState.ADOPTED,
        process_state=GatewayProcessState.ALIVE,
        pid=13500,
        listener_pid=13500,
        listener_alive=True,
        process_alive=True,
        health_authenticated=True,
        health=_health_ok(),
        reason="listener-fingerprint",
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
        await svc.probe_and_recover("i1")
        start.assert_not_called()
    assert inst.ownership_state == OwnershipState.ADOPTED.value
    assert inst.process_state == GatewayProcessState.ALIVE.value
    assert inst.healthy is True
    assert inst.last_error_code is None


@pytest.mark.asyncio
async def test_refresh_preserves_adoption() -> None:
    # @lat: [[tests#Gateway listener identity v152#Refresh preserves adoption]]
    settings = _settings()
    inst = _inst(
        ownership_state=OwnershipState.ADOPTED.value,
        gateway_listener_pid=13500,
        gateway_listener_create_time=1.0,
        pid=13500,
        process_create_time=1.0,
        gateway_fingerprint_version=2,
        runtime_version_id=None,
    )
    session_maker = MagicMock()
    session = AsyncMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=inst)
    session.commit = AsyncMock()
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    inspect = GatewayOwnershipResult(
        state=OwnershipState.ADOPTED,
        process_state=GatewayProcessState.ALIVE,
        pid=13500,
        listener_pid=13500,
        listener_alive=True,
        process_alive=True,
        health_authenticated=True,
        health=_health_ok(),
        reason="listener-fingerprint",
    )
    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
        patch.object(svc, "_version_label", AsyncMock(return_value="0.16.0")),
        patch("services.instance_gateway_service.instance_to_response") as to_resp,
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        resp = MagicMock()
        to_resp.return_value = resp
        await svc.refresh_instance_status("i1")
    assert inst.ownership_state == OwnershipState.ADOPTED.value
    assert inst.process_state == GatewayProcessState.ALIVE.value


@pytest.mark.asyncio
async def test_historical_conflict_clears_on_adoption() -> None:
    # @lat: [[tests#Gateway listener identity v152#Conflict clears]]
    settings = _settings()
    inst = _inst(
        ownership_state=OwnershipState.CONFLICT.value,
        last_error_code="GATEWAY_PORT_OWNERSHIP_CONFLICT",
        last_error="conflict",
        healthy=False,
        status=InstanceStatus.ERROR.value,
        gateway_listener_pid=13500,
        gateway_listener_create_time=1.0,
        pid=13500,
        process_create_time=1.0,
        gateway_fingerprint_version=2,
    )
    session_maker = MagicMock()
    session = AsyncMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=inst)
    session.commit = AsyncMock()
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    inspect = GatewayOwnershipResult(
        state=OwnershipState.ADOPTED,
        process_state=GatewayProcessState.ALIVE,
        pid=13500,
        listener_pid=13500,
        listener_alive=True,
        process_alive=True,
        health_authenticated=True,
        health=_health_ok(),
        reason="listener-fingerprint",
    )
    with (
        patch.object(svc._ownership, "inspect", AsyncMock(return_value=inspect)),
        patch.object(svc, "_resolve_secrets", AsyncMock(return_value={"API_SERVER_KEY": "x"})),
    ):
        from core.runtime_errors import RuntimeServiceError

        svc._resolve_executable = AsyncMock(  # type: ignore[method-assign]
            side_effect=RuntimeServiceError("x", code="hermes_executable_missing")
        )
        await svc.probe_and_recover("i1")
    assert inst.last_error_code is None
    assert inst.last_error is None
    assert inst.healthy is True
    assert inst.status == InstanceStatus.RUNNING.value
    assert inst.ownership_state == OwnershipState.ADOPTED.value


@pytest.mark.asyncio
async def test_healthy_foreign_remains_conflict() -> None:
    # @lat: [[tests#Gateway listener identity v152#Foreign healthy]]
    svc = GatewayOwnershipService(_settings(deployment_mode="production_http", gateway_safe_adoption_enabled=False))
    inst = _inst(pid=None, process_create_time=None, gateway_executable_path=None)
    with (
        patch("services.gateway_ownership_service.is_port_available", return_value=False),
        patch("services.gateway_ownership_service.find_pids_listening_on_port", return_value=[9999]),
        patch.object(svc, "_cmdline", return_value=["notepad.exe"]),
        patch.object(svc, "_exe", return_value="C:/Windows/notepad.exe"),
        patch.object(svc, "_hermes_environment_match", return_value=False),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client_cls.return_value.health_check = AsyncMock(return_value=_health_ok())
        result = await svc.inspect(inst, expected_executable="C:/hermes.exe", api_key="x")
    assert result.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT)
    assert result.owned_or_adopted is False


@pytest.mark.asyncio
async def test_listener_pid_reuse_is_stale() -> None:
    # @lat: [[tests#Gateway listener identity v152#PID reuse]]
    svc = GatewayOwnershipService(_settings())
    inst = _inst(
        gateway_listener_pid=13500,
        gateway_listener_create_time=1.0,
        gateway_fingerprint_version=2,
        pid=13500,
        process_create_time=1.0,
    )
    stale = OwnershipResult(
        state=OwnershipState.STALE,
        detail="create_time mismatch (pid reuse)",
        error_code="GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
    )
    with (
        patch("services.gateway_ownership_service.verify_ownership", return_value=stale),
        patch("services.gateway_ownership_service.is_pid_alive", return_value=True),
        patch("services.gateway_ownership_service.find_pids_listening_on_port", return_value=[13500]),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client_cls.return_value.health_check = AsyncMock(return_value=_health_ok())
        result = await svc.inspect(inst, api_key="x")
    assert result.state == OwnershipState.STALE
    assert result.process_state == GatewayProcessState.EXITED


@pytest.mark.asyncio
async def test_conflict_not_treated_as_exited() -> None:
    # @lat: [[tests#Gateway listener identity v152#Conflict not exited]]
    settings = _settings()
    inst = _inst(
        ownership_state=OwnershipState.CONFLICT.value,
        last_error_code="GATEWAY_PORT_OWNERSHIP_CONFLICT",
        process_state="alive",
        api_state="healthy",
        healthy=True,
    )
    session_maker = MagicMock()
    session = AsyncMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=inst)
    session.commit = AsyncMock()
    pm = MagicMock()
    pm.get_handle.return_value = None
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    inspect = GatewayOwnershipResult(
        state=OwnershipState.CONFLICT,
        process_state=GatewayProcessState.ALIVE,
        pid=13500,
        listener_pid=13500,
        listener_alive=True,
        process_alive=True,
        health_authenticated=True,
        health=_health_ok(),
        reason="GATEWAY_PORT_OWNERSHIP_CONFLICT",
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
        await svc.probe_and_recover("i1")
        start.assert_not_called()
    assert inst.process_state == GatewayProcessState.ALIVE.value
    assert inst.process_state != GatewayProcessState.EXITED.value
