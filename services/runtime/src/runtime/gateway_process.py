from __future__ import annotations

import asyncio
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import psutil

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import OwnershipState, PortOwnership
from integrations.hermes.cli_adapter import HermesCliAdapter
from runtime.gateway_environment import build_gateway_environment
from runtime.gateway_command_hash import compute_gateway_command_hash
from runtime.hermes_profile_paths import profile_home
import os

logger = get_logger(__name__)


def is_pid_alive(pid: int) -> bool:
    try:
        return psutil.pid_exists(pid)
    except Exception:
        return False


def terminate_pid(pid: int, *, timeout: float = 10.0) -> None:
    if not is_pid_alive(pid):
        return
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
        except psutil.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=timeout)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return


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


@dataclass(frozen=True)
class GatewayProcessFingerprint:
    """Process ownership fingerprint — PID alone is never sufficient (PRD v1.5 §13)."""

    pid: int
    process_create_time: float
    executable_path: str | None
    gateway_port: int
    instance_id: str


@dataclass(frozen=True)
class OwnershipResult:
    state: OwnershipState
    fingerprint: GatewayProcessFingerprint | None = None
    error_code: str | None = None
    detail: str | None = None

    @property
    def owned(self) -> bool:
        return self.state == OwnershipState.OWNED


@dataclass(frozen=True)
class PortOwnershipResult:
    state: PortOwnership
    port: int
    pids: list[int] = field(default_factory=list)
    detail: str | None = None


def capture_fingerprint(
    *,
    pid: int,
    gateway_port: int,
    instance_id: str,
    expected_executable: str | None = None,
) -> GatewayProcessFingerprint | None:
    """Capture create_time + exe for a newly spawned gateway process."""
    try:
        proc = psutil.Process(pid)
        create_time = float(proc.create_time())
        exe: str | None = None
        try:
            exe = proc.exe()
        except (psutil.AccessDenied, psutil.Error):
            exe = expected_executable
        return GatewayProcessFingerprint(
            pid=pid,
            process_create_time=create_time,
            executable_path=exe,
            gateway_port=gateway_port,
            instance_id=instance_id,
        )
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
        return None


def verify_ownership(
    *,
    pid: int | None,
    process_create_time: float | None,
    gateway_port: int,
    instance_id: str,
    expected_executable: str | None = None,
) -> OwnershipResult:
    """Verify Runtime still owns the recorded gateway process.

    Requires: PID alive AND create_time matches AND PID listens on port
    AND executable matches (when both sides available).
    """
    if pid is None:
        return OwnershipResult(state=OwnershipState.UNKNOWN, detail="no pid recorded")

    if not is_pid_alive(pid):
        return OwnershipResult(
            state=OwnershipState.STALE,
            detail="pid not alive",
            error_code="GATEWAY_PROCESS_STALE",
        )

    try:
        proc = psutil.Process(pid)
        current_create = float(proc.create_time())
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error) as exc:
        return OwnershipResult(
            state=OwnershipState.UNKNOWN,
            detail=str(exc),
            error_code="GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
        )

    if process_create_time is not None and abs(current_create - float(process_create_time)) > 0.5:
        return OwnershipResult(
            state=OwnershipState.STALE,
            detail="create_time mismatch (pid reuse)",
            error_code="GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
        )

    listeners = find_pids_listening_on_port(gateway_port)
    if listeners and pid not in listeners:
        return OwnershipResult(
            state=OwnershipState.FOREIGN,
            detail=f"port {gateway_port} owned by other pid(s): {listeners}",
            error_code="GATEWAY_PORT_OWNERSHIP_CONFLICT",
        )
    if not listeners:
        # Port busy but listener enumeration failed/empty — do not claim OWNED.
        from runtime.port_allocator import is_port_available

        if not is_port_available("127.0.0.1", gateway_port):
            return OwnershipResult(
                state=OwnershipState.UNKNOWN,
                detail=f"port {gateway_port} busy but listener pid unknown",
                error_code="GATEWAY_PORT_OWNERSHIP_CONFLICT",
            )

    exe: str | None = None
    try:
        exe = proc.exe()
    except (psutil.AccessDenied, psutil.Error):
        exe = None

    if expected_executable and exe:
        exp = Path(expected_executable).resolve()
        try:
            cur = Path(exe).resolve()
        except OSError:
            cur = Path(exe)
        if exp != cur and exp.name.lower() != cur.name.lower():
            if "hermes" not in cur.name.lower() and "python" not in cur.name.lower():
                return OwnershipResult(
                    state=OwnershipState.FOREIGN,
                    detail=f"executable mismatch: {exe}",
                    error_code="GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
                )

    fp = GatewayProcessFingerprint(
        pid=pid,
        process_create_time=current_create,
        executable_path=exe or expected_executable,
        gateway_port=gateway_port,
        instance_id=instance_id,
    )
    return OwnershipResult(state=OwnershipState.OWNED, fingerprint=fp)


def check_port_ownership(
    port: int,
    *,
    expected_pid: int | None = None,
) -> PortOwnershipResult:
    """Classify who owns a gateway port."""
    from runtime.port_allocator import is_port_available

    if is_port_available("127.0.0.1", port):
        return PortOwnershipResult(state=PortOwnership.FREE, port=port)

    listeners = find_pids_listening_on_port(port)
    if not listeners:
        return PortOwnershipResult(
            state=PortOwnership.UNKNOWN,
            port=port,
            detail="port busy but listener pid unknown",
        )
    if expected_pid is not None and all(pid == expected_pid for pid in listeners):
        return PortOwnershipResult(state=PortOwnership.OWNED, port=port, pids=listeners)
    if expected_pid is not None and expected_pid in listeners and len(listeners) == 1:
        return PortOwnershipResult(state=PortOwnership.OWNED, port=port, pids=listeners)
    return PortOwnershipResult(
        state=PortOwnership.FOREIGN,
        port=port,
        pids=listeners,
        detail="port occupied by foreign process",
    )


@dataclass
class GatewayProcessHandle:
    profile_id: str
    profile_name: str
    port: int
    # Compatibility: primary process identity is the listener when known.
    pid: int | None = None
    process: asyncio.subprocess.Process | None = None
    log_path: Path | None = None
    process_create_time: float | None = None
    executable_path: str | None = None
    command_hash: str | None = None
    parent_runtime_pid: int | None = None
    # PRD v1.5.2 launcher / listener split
    launcher_pid: int | None = None
    launcher_create_time: float | None = None
    launcher_executable_path: str | None = None
    listener_pid: int | None = None
    listener_create_time: float | None = None
    listener_executable_path: str | None = None
    _log_file: object | None = field(default=None, repr=False)
    _watch_task: asyncio.Task[None] | None = field(default=None, repr=False)

    def is_alive(self) -> bool:
        """True when launcher subprocess is tracked OR listener PID is alive."""
        if self.process is not None and self.process.returncode is None:
            return True
        if self.listener_pid is not None:
            return is_pid_alive(self.listener_pid)
        if self.pid is not None:
            return is_pid_alive(self.pid)
        return False

    def is_launcher_alive(self) -> bool:
        if self.process is not None:
            return self.process.returncode is None
        if self.launcher_pid is not None:
            return is_pid_alive(self.launcher_pid)
        return False

    def fingerprint(self, instance_id: str | None = None) -> GatewayProcessFingerprint | None:
        """Listener-centric fingerprint for ownership verification."""
        pid = self.listener_pid if self.listener_pid is not None else self.pid
        create_time = (
            self.listener_create_time
            if self.listener_create_time is not None
            else self.process_create_time
        )
        if pid is None or create_time is None:
            return None
        return GatewayProcessFingerprint(
            pid=pid,
            process_create_time=create_time,
            executable_path=self.listener_executable_path or self.executable_path,
            gateway_port=self.port,
            instance_id=instance_id or self.profile_id,
        )


class GatewayProcessManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._handles: dict[str, GatewayProcessHandle] = {}
        self._exit_callbacks: dict[str, list] = {}

    def get_handle(self, profile_id: str) -> GatewayProcessHandle | None:
        return self._handles.get(profile_id)

    def on_process_exit(self, profile_id: str, callback) -> None:
        """Register callback(profile_id, pid, exit_code) for process watcher."""
        self._exit_callbacks.setdefault(profile_id, []).append(callback)

    def detach(self, profile_id: str) -> None:
        """Drop in-memory handle without terminating the OS process (reload preserve)."""
        handle = self._handles.pop(profile_id, None)
        if handle is None:
            return
        if handle._watch_task and not handle._watch_task.done():
            handle._watch_task.cancel()
        if handle._log_file:
            try:
                handle._log_file.close()  # type: ignore[union-attr]
            except Exception:
                pass
        logger.info("gateway_detached", profile_id=profile_id, pid=handle.pid)

    def detach_all(self) -> None:
        for profile_id in list(self._handles.keys()):
            self.detach(profile_id)

    async def _watch_process(self, handle: GatewayProcessHandle) -> None:
        """Watch launcher subprocess. Launcher exit ≠ Gateway exit (PRD v1.5.2 §49–51)."""
        if handle.process is None:
            return
        try:
            code = await handle.process.wait()
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.warning("gateway_watch_failed", profile_id=handle.profile_id, error=str(exc))
            return
        listener_alive = bool(
            handle.listener_pid is not None and is_pid_alive(handle.listener_pid)
        )
        logger.info(
            "gateway.launcher.exited",
            instanceId=handle.profile_id,
            launcherPid=handle.launcher_pid or handle.pid,
            listenerPid=handle.listener_pid,
            listenerAlive=listener_alive,
            exitCode=code,
        )
        # Only emit gateway.process.exited when listener is also gone.
        if not listener_alive:
            logger.info(
                "gateway.process.exited",
                instanceId=handle.profile_id,
                pid=handle.listener_pid or handle.pid,
                exitCode=code,
                expected=False,
                source="launcher_watch_listener_gone",
            )
            for cb in list(self._exit_callbacks.get(handle.profile_id, [])):
                try:
                    result = cb(handle.profile_id, handle.listener_pid or handle.pid, code)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception:
                    logger.exception("gateway_exit_callback_failed", profile_id=handle.profile_id)

    async def _create_gateway_process(
        self,
        cmd: list[str],
        log_file: object,
        *,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> asyncio.subprocess.Process:
        kwargs: dict[str, object] = {
            "stdout": log_file,
            "stderr": asyncio.subprocess.STDOUT,
            "cwd": str(cwd) if cwd else str(self._settings.hermes_home_path),
        }
        if env is not None:
            kwargs["env"] = env

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
        env: dict[str, str] | None = None,
        secrets: dict[str, str] | None = None,
    ) -> GatewayProcessHandle:
        if profile_id in self._handles and self._handles[profile_id].is_alive():
            return self._handles[profile_id]

        log_path = self._settings.log_dir_path / f"gateway-{profile_name}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("a", encoding="utf-8")

        child_env = env
        if child_env is None and mock_command is None:
            child_env = build_gateway_environment(
                self._settings,
                profile_name=profile_name,
                gateway_port=port,
                secrets=secrets,
                require_api_server_key=secrets is not None,
            )

        if mock_command is not None:
            cmd = mock_command
        else:
            adapter = HermesCliAdapter(
                self._settings,
                executable=Path(hermes_executable) if hermes_executable else None,
            )
            cmd = adapter.gateway_command(profile_name=profile_name, port=port)
            if "--profile" in cmd or "--port" in cmd:
                from core.runtime_errors import RuntimeServiceError

                raise RuntimeServiceError(
                    "Invalid gateway command contains forbidden --profile/--port",
                    code="gateway_command_invalid",
                    details={"cmd": cmd},
                )

        cwd = profile_home(self._settings, profile_name)
        cwd.mkdir(parents=True, exist_ok=True)

        logger.info(
            "gateway_starting",
            profile_id=profile_id,
            cmd=cmd,
            port=port,
            cwd=str(cwd),
            envKeys=sorted(child_env.keys()) if child_env else None,
        )
        process = await self._create_gateway_process(cmd, log_file, cwd=cwd, env=child_env)
        from runtime.gateway_listener import GatewayListenerResolver, capture_launcher_identity

        launcher_pid = process.pid
        launcher = (
            capture_launcher_identity(launcher_pid, expected_executable=hermes_executable)
            if launcher_pid
            else None
        )
        launcher_create = launcher.create_time if launcher else None
        launcher_exe = (launcher.executable_path if launcher else None) or hermes_executable
        logger.info(
            "gateway.launcher.started",
            profile_id=profile_id,
            launcherPid=launcher_pid,
            processCreateTime=launcher_create,
            port=port,
        )

        listener_pid: int | None = None
        listener_create: float | None = None
        listener_exe: str | None = None
        if launcher_pid and mock_command is not None:
            # Test/mock gateways are same-process listeners; skip port discovery wait.
            listener_pid = launcher_pid
            listener_create = launcher_create
            listener_exe = launcher_exe
            logger.info(
                "gateway.identity.established",
                profile_id=profile_id,
                launcherPid=launcher_pid,
                listenerPid=listener_pid,
                port=port,
                source="mock_same_process",
            )
        elif launcher_pid:
            timeout = float(self._settings.hermes_gateway_start_timeout_seconds)
            try:
                listener = await GatewayListenerResolver().resolve(
                    launcher_pid,
                    port,
                    timeout,
                    poll_interval=float(self._settings.gateway_health_poll_interval_sec),
                )
                listener_pid = listener.pid
                listener_create = listener.create_time
                listener_exe = listener.executable_path
                logger.info(
                    "gateway.identity.established",
                    profile_id=profile_id,
                    launcherPid=launcher_pid,
                    listenerPid=listener_pid,
                    port=port,
                )
            except TimeoutError as exc:
                # Fall back to launcher-as-listener for same-process gateways.
                logger.warning(
                    "gateway.listener.discovery_timeout",
                    profile_id=profile_id,
                    launcherPid=launcher_pid,
                    port=port,
                    error=str(exc),
                )
                listeners = find_pids_listening_on_port(port)
                if launcher_pid in listeners or not listeners:
                    listener_pid = launcher_pid
                    listener_create = launcher_create
                    listener_exe = launcher_exe
                else:
                    # Foreign listener during startup — leave listener unset; ownership will conflict.
                    pass

        handle = GatewayProcessHandle(
            profile_id=profile_id,
            profile_name=profile_name,
            port=port,
            # Compatibility pid/create_time map to listener when known (PRD §10).
            pid=listener_pid if listener_pid is not None else launcher_pid,
            process=process,
            log_path=log_path,
            process_create_time=listener_create if listener_create is not None else launcher_create,
            executable_path=listener_exe or launcher_exe,
            command_hash=compute_gateway_command_hash(
                executable=launcher_exe,
                profile_name=profile_name,
                port=port,
                command=cmd,
            ),
            parent_runtime_pid=os.getpid(),
            launcher_pid=launcher_pid,
            launcher_create_time=launcher_create,
            launcher_executable_path=launcher_exe,
            listener_pid=listener_pid,
            listener_create_time=listener_create,
            listener_executable_path=listener_exe,
            _log_file=log_file,
        )
        handle._watch_task = asyncio.create_task(
            self._watch_process(handle),
            name=f"gateway-watch-{profile_id}",
        )
        self._handles[profile_id] = handle
        return handle

    async def _stop_handle(self, handle: GatewayProcessHandle) -> None:
        # Prefer terminating tracked launcher subprocess.
        if handle.process and handle.is_launcher_alive():
            handle.process.terminate()
            try:
                await asyncio.wait_for(handle.process.wait(), timeout=10.0)
            except TimeoutError:
                handle.process.kill()
                await handle.process.wait()
        elif handle.launcher_pid is not None and is_pid_alive(handle.launcher_pid):
            await asyncio.to_thread(terminate_pid, handle.launcher_pid)

        # Also terminate listener when it differs and ownership fingerprint matches.
        listener_pid = handle.listener_pid or handle.pid
        listener_ct = handle.listener_create_time or handle.process_create_time
        if (
            listener_pid is not None
            and is_pid_alive(listener_pid)
            and listener_pid != handle.launcher_pid
        ):
            if listener_ct is not None:
                ownership = verify_ownership(
                    pid=listener_pid,
                    process_create_time=listener_ct,
                    gateway_port=handle.port,
                    instance_id=handle.profile_id,
                    expected_executable=handle.listener_executable_path or handle.executable_path,
                )
                if not ownership.owned:
                    logger.warning(
                        "gateway_stop_skipped_unowned_listener",
                        profile_id=handle.profile_id,
                        pid=listener_pid,
                        ownership=ownership.state.value,
                    )
                else:
                    await asyncio.to_thread(terminate_pid, listener_pid)
            else:
                await asyncio.to_thread(terminate_pid, listener_pid)
        if handle._log_file:
            handle._log_file.close()

    async def stop(
        self,
        profile_id: str,
        *,
        pid: int | None = None,
        port: int | None = None,
        process_create_time: float | None = None,
        expected_executable: str | None = None,
        kill_unknown_port_listeners: bool = False,
        listener_pid: int | None = None,
        listener_create_time: float | None = None,
    ) -> None:
        handle = self._handles.pop(profile_id, None)

        if handle is not None:
            await self._stop_handle(handle)
            port = port or handle.port
            pid = pid or handle.listener_pid or handle.pid
            process_create_time = (
                process_create_time
                if process_create_time is not None
                else (handle.listener_create_time or handle.process_create_time)
            )
            expected_executable = (
                expected_executable
                or handle.listener_executable_path
                or handle.executable_path
            )
            listener_pid = listener_pid or handle.listener_pid
            listener_create_time = listener_create_time or handle.listener_create_time

        target_pid = listener_pid or pid
        target_ct = listener_create_time if listener_create_time is not None else process_create_time
        if target_pid is not None and is_pid_alive(target_pid):
            if target_ct is not None:
                ownership = verify_ownership(
                    pid=target_pid,
                    process_create_time=target_ct,
                    gateway_port=port or 0,
                    instance_id=profile_id,
                    expected_executable=expected_executable,
                )
                if not ownership.owned:
                    logger.warning(
                        "gateway_terminate_skipped_unowned",
                        profile_id=profile_id,
                        pid=target_pid,
                        ownership=ownership.state.value,
                        detail=ownership.detail,
                    )
                    return
            await asyncio.to_thread(terminate_pid, target_pid)

        if port is not None and kill_unknown_port_listeners:
            from runtime.port_allocator import is_port_available

            if not is_port_available("127.0.0.1", port):
                listeners = find_pids_listening_on_port(port)
                for lp in listeners:
                    if target_pid is not None and lp == target_pid:
                        continue
                    await asyncio.to_thread(terminate_pid, lp)

    async def release_port(self, port: int) -> None:
        """No-op force release — PRD v1.5 forbids killing unknown port occupants.

        Kept for API compatibility; callers must wait or surface Port Ownership Conflict.
        """
        from runtime.port_allocator import is_port_available

        if not is_port_available("127.0.0.1", port):
            listeners = find_pids_listening_on_port(port)
            logger.warning(
                "gateway_release_port_refused",
                port=port,
                listeners=listeners,
                reason="PRD v1.5 — never auto-kill unknown port listeners",
            )

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
