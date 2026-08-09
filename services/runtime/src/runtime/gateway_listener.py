"""Gateway Launcher / Listener process identity (PRD v1.5.2 §7–18)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import psutil

from core.logging import get_logger
from runtime.gateway_process import find_pids_listening_on_port, is_pid_alive

logger = get_logger(__name__)


@dataclass(frozen=True)
class GatewayLauncherIdentity:
    pid: int
    create_time: float
    executable_path: str | None = None


@dataclass(frozen=True)
class GatewayListenerIdentity:
    pid: int
    create_time: float
    executable_path: str | None
    port: int


@dataclass(frozen=True)
class GatewayProcessIdentity:
    launcher: GatewayLauncherIdentity | None
    listener: GatewayListenerIdentity


def capture_launcher_identity(
    pid: int,
    *,
    expected_executable: str | None = None,
) -> GatewayLauncherIdentity | None:
    """Capture identity for the Runtime-spawned launcher process."""
    try:
        proc = psutil.Process(pid)
        create_time = float(proc.create_time())
        exe: str | None = None
        try:
            exe = proc.exe()
        except (psutil.AccessDenied, psutil.Error):
            exe = expected_executable
        return GatewayLauncherIdentity(pid=pid, create_time=create_time, executable_path=exe)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
        return None


def capture_listener_identity(pid: int, port: int) -> GatewayListenerIdentity | None:
    """Capture identity for the process listening on the gateway port."""
    try:
        proc = psutil.Process(pid)
        create_time = float(proc.create_time())
        exe: str | None = None
        try:
            exe = proc.exe()
        except (psutil.AccessDenied, psutil.Error):
            exe = None
        return GatewayListenerIdentity(
            pid=pid,
            create_time=create_time,
            executable_path=exe,
            port=port,
        )
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
        return None


def is_descendant_of(candidate_pid: int, ancestor_pid: int) -> bool:
    """Return True if candidate_pid is ancestor_pid or a recursive child."""
    if candidate_pid == ancestor_pid:
        return True
    if not is_pid_alive(ancestor_pid):
        return False
    try:
        children = psutil.Process(ancestor_pid).children(recursive=True)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
        return False
    return any(child.pid == candidate_pid for child in children)


def verify_lineage(launcher_pid: int, listener_pid: int) -> bool:
    """PRD §17 — listener must be launcher itself or a descendant."""
    return is_descendant_of(listener_pid, launcher_pid)


class GatewayListenerResolver:
    """Discover the real Gateway listener after launcher spawn (PRD §15–16)."""

    async def resolve(
        self,
        launcher_pid: int,
        gateway_port: int,
        timeout: float,
        *,
        poll_interval: float = 0.25,
    ) -> GatewayListenerIdentity:
        deadline = time.monotonic() + max(0.1, float(timeout))
        last_listeners: list[int] = []
        while time.monotonic() < deadline:
            if not is_pid_alive(launcher_pid):
                # Launcher may exit after forking listener — keep scanning port.
                pass
            listeners = find_pids_listening_on_port(gateway_port)
            last_listeners = listeners
            if not listeners:
                await asyncio.sleep(poll_interval)
                continue

            for pid in listeners:
                if verify_lineage(launcher_pid, pid):
                    identity = capture_listener_identity(pid, gateway_port)
                    if identity is not None:
                        logger.info(
                            "gateway.listener.discovered",
                            launcher_pid=launcher_pid,
                            listener_pid=pid,
                            port=gateway_port,
                            lineage_ok=True,
                        )
                        return identity

            # Listeners exist but none in lineage — keep waiting until timeout.
            await asyncio.sleep(poll_interval)

        raise TimeoutError(
            f"Gateway listener not discovered on port {gateway_port} "
            f"within {timeout}s (launcher={launcher_pid}, listeners={last_listeners})"
        )
