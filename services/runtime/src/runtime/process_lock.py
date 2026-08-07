"""Single-instance process lock for Runtime (PRD FR-804)."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from core.errors import CopilotError
from core.logging import get_logger

logger = get_logger(__name__)


class RuntimeAlreadyRunningError(CopilotError):
    def __init__(
        self,
        message: str = "Another runtime instance is already running",
        *,
        pid: int | None = None,
    ) -> None:
        if pid is not None:
            message = f"{message} (pid={pid})"
        super().__init__(message, code="runtime_already_running")
        self.pid = pid


def _pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        kernel32 = ctypes.windll.kernel32
        process_query_limited_information = 0x1000
        still_active = 259
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
        if not handle:
            return False
        try:
            exit_code = ctypes.c_ulong()
            if kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)) == 0:
                return False
            return int(exit_code.value) == still_active
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but we cannot signal it.
        return True
    except OSError:
        return False
    return True


def _read_lock_pid(path: Path) -> int | None:
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not raw.isdigit():
        return None
    return int(raw)


@dataclass
class ProcessLock:
    path: Path
    _fh: object | None = None

    @classmethod
    def for_data_dir(cls, data_dir: Path) -> ProcessLock:
        lock_dir = data_dir / "locks"
        lock_dir.mkdir(parents=True, exist_ok=True)
        return cls(path=lock_dir / "runtime.lock")

    def acquire(self) -> None:
        if self._fh is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self._try_create():
            holder = _read_lock_pid(self.path)
            if not self._reclaim_if_stale():
                raise RuntimeAlreadyRunningError(pid=holder)
            if not self._try_create():
                raise RuntimeAlreadyRunningError(pid=_read_lock_pid(self.path))

    def _try_create(self) -> bool:
        flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
        try:
            fd = os.open(self.path, flags)
        except FileExistsError:
            return False
        fh = os.fdopen(fd, "w+b")
        fh.write(str(os.getpid()).encode())
        fh.flush()
        self._fh = fh
        return True

    def _reclaim_if_stale(self) -> bool:
        pid = _read_lock_pid(self.path)
        if pid is None:
            logger.warning("process_lock_invalid", path=str(self.path))
        elif _pid_is_alive(pid):
            return False
        else:
            logger.warning("process_lock_stale_reclaimed", pid=pid, path=str(self.path))
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            return False
        return True

    def release(self) -> None:
        fh = self._fh
        if fh is None:
            # Startup may fail after another process left a file we do not own; never unlink then.
            return
        try:
            fh.close()
        except OSError:
            pass
        self._fh = None
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            pass
        logger.info("process_lock_released")
