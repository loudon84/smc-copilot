from __future__ import annotations

import asyncio
import shlex
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import psutil

from core.config import Settings
from core.logging import get_logger

logger = get_logger(__name__)


def is_pid_alive(pid: int) -> bool:
    try:
        return psutil.pid_exists(pid)
    except Exception:
        return False


def terminate_pid(pid: int, *, timeout: float = 10.0) -> None:
    if not is_pid_alive(pid):
        return
    proc = psutil.Process(pid)
    proc.terminate()
    try:
        proc.wait(timeout=timeout)
    except psutil.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=timeout)


def find_pids_listening_on_port(port: int) -> list[int]:
    """Return PIDs listening on 127.0.0.1:port (best-effort; may be empty without permissions)."""
    pids: set[int] = set()
    try:
        for conn in psutil.net_connections(kind="inet"):
            if not conn.laddr or conn.laddr.port != port:
                continue
            if conn.status not in (psutil.CONN_LISTEN, "LISTEN"):
                continue
            if conn.pid:
                pids.add(conn.pid)
    except (psutil.AccessDenied, PermissionError):
        logger.warning("net_connections_denied", port=port)
    except Exception as exc:
        logger.warning("net_connections_failed", port=port, error=str(exc))
    return sorted(pids)


async def terminate_listeners_on_port(port: int, *, timeout: float = 10.0) -> None:
    for pid in find_pids_listening_on_port(port):
        await asyncio.to_thread(terminate_pid, pid, timeout=timeout)


@dataclass
class GatewayProcessHandle:
    profile_id: str
    profile_name: str
    port: int
    pid: int | None = None
    process: asyncio.subprocess.Process | None = None
    log_path: Path | None = None
    _log_file: object | None = field(default=None, repr=False)

    def is_alive(self) -> bool:
        if self.process is None:
            return False
        return self.process.returncode is None


class GatewayProcessManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._handles: dict[str, GatewayProcessHandle] = {}

    def get_handle(self, profile_id: str) -> GatewayProcessHandle | None:
        return self._handles.get(profile_id)

    async def _create_gateway_process(
        self,
        cmd: list[str],
        log_file: object,
    ) -> asyncio.subprocess.Process:
        kwargs: dict[str, object] = {
            "stdout": log_file,
            "stderr": asyncio.subprocess.STDOUT,
            "cwd": str(self._settings.hermes_home_path),
        }

        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            kwargs["startupinfo"] = startupinfo

        return await asyncio.create_subprocess_exec(*cmd, **kwargs)

    async def start(
        self,
        profile_id: str,
        profile_name: str,
        port: int,
        *,
        mock_command: list[str] | None = None,
        hermes_executable: str | None = None,
    ) -> GatewayProcessHandle:
        if profile_id in self._handles and self._handles[profile_id].is_alive():
            return self._handles[profile_id]

        log_path = self._settings.log_dir_path / f"gateway-{profile_name}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("a", encoding="utf-8")

        if mock_command is not None:
            cmd = mock_command
        elif hermes_executable:
            # PRD §7.7: argv array only; never shell=True
            cmd = [
                hermes_executable,
                "gateway",
                "run",
                "--profile",
                profile_name,
                "--port",
                str(port),
            ]
        else:
            base = shlex.split(self._settings.hermes_gateway_command, posix=(sys.platform != "win32"))
            cmd = [*base, "--port", str(port), "--profile", profile_name]

        logger.info("gateway_starting", profile_id=profile_id, cmd=cmd, port=port)
        process = await self._create_gateway_process(cmd, log_file)
        handle = GatewayProcessHandle(
            profile_id=profile_id,
            profile_name=profile_name,
            port=port,
            pid=process.pid,
            process=process,
            log_path=log_path,
            _log_file=log_file,
        )
        self._handles[profile_id] = handle
        return handle

    async def _stop_handle(self, handle: GatewayProcessHandle) -> None:
        if handle.process and handle.is_alive():
            handle.process.terminate()
            try:
                await asyncio.wait_for(handle.process.wait(), timeout=10.0)
            except TimeoutError:
                handle.process.kill()
                await handle.process.wait()
        elif handle.pid is not None:
            await asyncio.to_thread(terminate_pid, handle.pid)
        if handle._log_file:
            handle._log_file.close()

    async def stop(self, profile_id: str, *, pid: int | None = None, port: int | None = None) -> None:
        handle = self._handles.pop(profile_id, None)

        if handle is not None:
            await self._stop_handle(handle)
            port = port or handle.port

        if pid is not None and is_pid_alive(pid):
            await asyncio.to_thread(terminate_pid, pid)

        if port is not None:
            from runtime.port_allocator import is_port_available

            if not is_port_available("127.0.0.1", port):
                await terminate_listeners_on_port(port)

    async def release_port(self, port: int) -> None:
        """Force-release a gateway port when stop did not clear an orphan listener."""
        from runtime.port_allocator import is_port_available

        if not is_port_available("127.0.0.1", port):
            await terminate_listeners_on_port(port)

    async def shutdown_all(self) -> None:
        for profile_id in list(self._handles.keys()):
            await self.stop(profile_id)

    def read_logs(self, profile_id: str, *, tail: int = 200) -> tuple[list[str], bool]:
        handle = self._handles.get(profile_id)
        if handle is None or handle.log_path is None or not handle.log_path.exists():
            return [], False
        lines = handle.log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        truncated = len(lines) > tail
        return lines[-tail:], truncated
