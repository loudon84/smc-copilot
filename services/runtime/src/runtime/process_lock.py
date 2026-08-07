"""Single-instance process lock for Runtime (PRD FR-804)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from core.errors import CopilotError
from core.logging import get_logger

logger = get_logger(__name__)


class RuntimeAlreadyRunningError(CopilotError):
    def __init__(self, message: str = "Another runtime instance is already running") -> None:
        super().__init__(message, code="runtime_already_running")


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
        flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
        try:
            fd = os.open(self.path, flags)
        except FileExistsError as e:
            raise RuntimeAlreadyRunningError() from e
        fh = os.fdopen(fd, "w+b")
        fh.write(str(os.getpid()).encode())
        fh.flush()
        self._fh = fh

    def release(self) -> None:
        fh = self._fh
        if fh is None:
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
