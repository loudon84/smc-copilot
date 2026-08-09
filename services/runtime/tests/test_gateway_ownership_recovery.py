"""PRD v1.5.1 Gateway ownership recovery / safe adoption / health≠ownership."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import Settings
from core.runtime_enums import DesiredState, InstanceStatus, OwnershipState
from integrations.hermes.client import GatewayHealthResult
from runtime.gateway_command_hash import compute_gateway_command_hash
from services.gateway_ownership_service import (
    GatewayOwnershipService,
    SafeAdoptionEvidence,
    safe_adoption_enabled,
)
from services.instance_gateway_service import InstanceGatewayService


def _settings(**overrides: object) -> Settings:
    s = Settings()
    s.deployment_mode = "development_stub"
    s.gateway_dev_allow_safe_adoption = True
    s.gateway_safe_adoption_enabled = False
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def test_command_hash_excludes_secrets() -> None:
    # @lat: [[tests#Gateway ownership v151#Command hash]]
    h1 = compute_gateway_command_hash(
        executable="C:/hermes.exe",
        profile_name="default",
        port=8642,
        command=["hermes", "gateway", "run", "--external-supervisor", "API_SERVER_KEY=secret"],
    )
    h2 = compute_gateway_command_hash(
        executable="C:/hermes.exe",
        profile_name="default",
        port=8642,
        command=["hermes", "gateway", "run", "--external-supervisor"],
    )
    assert h1 == h2
    assert len(h1) == 64


def test_safe_adoption_enabled_maps_development_stub() -> None:
    assert safe_adoption_enabled(_settings()) is True
    assert safe_adoption_enabled(_settings(deployment_mode="production_http")) is False
    assert safe_adoption_enabled(
        _settings(deployment_mode="production_http", gateway_safe_adoption_enabled=True)
    ) is True


def test_health_alone_never_owned() -> None:
    # @lat: [[tests#Gateway ownership v151#Health not ownership]]
    evidence = SafeAdoptionEvidence(
        executable_match=False,
        command_match=False,
        profile_match=False,
        port_match=True,
        health_authenticated=True,
        runtime_version_match=False,
    )
    assert evidence.all_required is False


@pytest.mark.asyncio
async def test_foreign_healthy_gateway_is_conflict() -> None:
    # @lat: [[tests#Gateway ownership v151#Foreign healthy]]
    settings = _settings()
    svc = GatewayOwnershipService(settings)
    inst = MagicMock()
    inst.id = "i1"
    inst.pid = None
    inst.process_create_time = None
    inst.gateway_port = 8642
    inst.profile_name = "default"
    inst.gateway_executable_path = None
    inst.gateway_command_hash = None
    inst.gateway_listener_pid = None
    inst.gateway_listener_create_time = None
    inst.gateway_launcher_pid = None
    inst.gateway_fingerprint_version = 1

    health = GatewayHealthResult(
        reachable=True,
        authenticated=True,
        healthy=True,
        status_code=200,
        source="/health",
    )

    with (
        patch("services.gateway_ownership_service.is_port_available", return_value=False),
        patch("services.gateway_ownership_service.find_pids_listening_on_port", return_value=[9999]),
        patch.object(svc, "_cmdline", return_value=["notepad.exe"]),
        patch.object(svc, "_exe", return_value="C:/Windows/notepad.exe"),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client = MagicMock()
        client.health_check = AsyncMock(return_value=health)
        client_cls.return_value = client
        result = await svc.inspect(inst, expected_executable="C:/hermes.exe", api_key="x")

    assert result.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT)
    assert result.safe_to_adopt is False
    assert result.health_authenticated is True


@pytest.mark.asyncio
async def test_persistent_fingerprint_adopts() -> None:
    # @lat: [[tests#Gateway ownership v151#Persistent adopt]]
    settings = _settings()
    svc = GatewayOwnershipService(settings)
    inst = MagicMock()
    inst.id = "i2"
    inst.pid = 4242
    inst.process_create_time = 1000.0
    inst.gateway_port = 8642
    inst.profile_name = "default"
    inst.gateway_executable_path = "C:/hermes.exe"
    inst.gateway_command_hash = None
    inst.gateway_listener_pid = None
    inst.gateway_listener_create_time = None
    inst.gateway_launcher_pid = None
    inst.gateway_fingerprint_version = 1

    from runtime.gateway_process import OwnershipResult

    owned = OwnershipResult(state=OwnershipState.OWNED)
    health = GatewayHealthResult(
        reachable=True,
        authenticated=True,
        healthy=True,
        status_code=200,
        source="/health",
    )

    with (
        patch("services.gateway_ownership_service.is_pid_alive", return_value=True),
        patch("services.gateway_ownership_service.verify_ownership", return_value=owned),
        patch("services.gateway_ownership_service.find_pids_listening_on_port", return_value=[4242]),
        patch.object(svc, "_cmdline", return_value=["hermes", "gateway", "run", "--external-supervisor"]),
        patch.object(svc, "_exe", return_value="C:/hermes.exe"),
        patch("services.gateway_ownership_service.HermesGatewayClient") as client_cls,
    ):
        client = MagicMock()
        client.health_check = AsyncMock(return_value=health)
        client_cls.return_value = client
        result = await svc.inspect(inst, expected_executable="C:/hermes.exe", api_key="x", tracked_alive=False)

    assert result.state == OwnershipState.ADOPTED
    assert result.owned_or_adopted is True


@pytest.mark.asyncio
async def test_preserve_detach_does_not_stop() -> None:
    # @lat: [[tests#Gateway ownership v151#Dev reload preserve]]
    settings = _settings()
    session_maker = MagicMock()
    pm = MagicMock()
    pm.detach_all = MagicMock()
    svc = InstanceGatewayService(settings=settings, session_maker=session_maker, process_manager=pm)
    await svc.shutdown_all_instances(preserve=True)
    pm.detach_all.assert_called_once()


@pytest.mark.asyncio
async def test_stale_pid_reuse_not_killed() -> None:
    # @lat: [[tests#Gateway ownership v151#PID reuse]]
    from runtime.gateway_process import OwnershipResult, verify_ownership

    # create_time mismatch → STALE, never OWNED
    with patch("runtime.gateway_process.is_pid_alive", return_value=True), patch(
        "runtime.gateway_process.psutil.Process"
    ) as proc_cls, patch(
        "runtime.gateway_process.find_pids_listening_on_port", return_value=[1234]
    ):
        proc = MagicMock()
        proc.create_time.return_value = 9999.0
        proc.exe.return_value = "C:/hermes.exe"
        proc_cls.return_value = proc
        result = verify_ownership(
            pid=1234,
            process_create_time=1000.0,
            gateway_port=8642,
            instance_id="x",
            expected_executable="C:/hermes.exe",
        )
    assert result.state == OwnershipState.STALE
    assert result.owned is False
