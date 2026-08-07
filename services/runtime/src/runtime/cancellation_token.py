from __future__ import annotations

import asyncio

from core.runtime_errors import RuntimeServiceError


# @lat: [[runtime-service#更新与回滚]]
class JobCancelled(RuntimeServiceError):
    """Raised when a cooperative job cancellation is observed."""

    def __init__(self, message: str = "Job cancelled") -> None:
        super().__init__(message, code="cancelled")


class CancellationToken:
    """Cooperative cancellation signal for long-running runtime jobs."""

    def __init__(self) -> None:
        self._cancelled = False
        self._event = asyncio.Event()

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    def cancel(self) -> None:
        if not self._cancelled:
            self._cancelled = True
            self._event.set()

    async def wait_cancelled(self) -> None:
        await self._event.wait()

    def raise_if_cancelled(self) -> None:
        if self._cancelled:
            raise JobCancelled()
