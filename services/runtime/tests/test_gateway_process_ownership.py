"""Process ownership fingerprint unit tests (PRD v1.5 §79)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from core.runtime_enums import OwnershipState, PortOwnership
from runtime.gateway_process import (
    GatewayProcessFingerprint,
    check_port_ownership,
    verify_ownership,
)


def test_owned_when_pid_create_time_port_match() -> None:
    # @lat: [[tests#Gateway process ownership#Correct PID]]
    with (
        patch("runtime.gateway_process.is_pid_alive", return_value=True),
        patch("runtime.gateway_process.find_pids_listening_on_port", return_value=[1234]),
        patch("runtime.gateway_process.psutil.Process") as mock_proc_cls,
    ):
        proc = MagicMock()
        proc.create_time.return_value = 1000.0
        proc.exe.return_value = r"C:\hermes\hermes.exe"
        mock_proc_cls.return_value = proc

        result = verify_ownership(
            pid=1234,
            process_create_time=1000.0,
            gateway_port=8642,
            instance_id="inst-1",
            expected_executable=r"C:\hermes\hermes.exe",
        )

    assert result.owned is True
    assert result.state == OwnershipState.OWNED
    assert isinstance(result.fingerprint, GatewayProcessFingerprint)


def test_stale_when_create_time_mismatches() -> None:
    # @lat: [[tests#Gateway process ownership#PID reused]]
    with (
        patch("runtime.gateway_process.is_pid_alive", return_value=True),
        patch("runtime.gateway_process.psutil.Process") as mock_proc_cls,
    ):
        proc = MagicMock()
        proc.create_time.return_value = 9999.0  # different from stored
        mock_proc_cls.return_value = proc

        result = verify_ownership(
            pid=1234,
            process_create_time=1000.0,
            gateway_port=8642,
            instance_id="inst-1",
        )

    assert result.owned is False
    assert result.state == OwnershipState.STALE
    assert result.error_code == "GATEWAY_PROCESS_OWNERSHIP_CONFLICT"


def test_foreign_when_other_pid_owns_port() -> None:
    with (
        patch("runtime.gateway_process.is_pid_alive", return_value=True),
        patch("runtime.gateway_process.find_pids_listening_on_port", return_value=[9999]),
        patch("runtime.gateway_process.psutil.Process") as mock_proc_cls,
    ):
        proc = MagicMock()
        proc.create_time.return_value = 1000.0
        proc.exe.return_value = r"C:\hermes\hermes.exe"
        mock_proc_cls.return_value = proc

        result = verify_ownership(
            pid=1234,
            process_create_time=1000.0,
            gateway_port=8642,
            instance_id="inst-1",
        )

    assert result.state == OwnershipState.FOREIGN
    assert result.error_code == "GATEWAY_PORT_OWNERSHIP_CONFLICT"


def test_port_ownership_foreign() -> None:
    with (
        patch("runtime.port_allocator.is_port_available", return_value=False),
        patch("runtime.gateway_process.find_pids_listening_on_port", return_value=[5555]),
    ):
        result = check_port_ownership(8642, expected_pid=1234)

    assert result.state == PortOwnership.FOREIGN
    assert 5555 in result.pids


def test_port_ownership_free() -> None:
    with patch("runtime.port_allocator.is_port_available", return_value=True):
        result = check_port_ownership(8642, expected_pid=1234)
    assert result.state == PortOwnership.FREE
