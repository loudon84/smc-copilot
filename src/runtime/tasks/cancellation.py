"""Task cancellation flow (FR-505)."""

from __future__ import annotations

import asyncio
from typing import Any

from core.logging import get_logger
from runtime.tasks.hermes_adapter import HermesRuntimeAdapter

logger = get_logger(__name__)

CANCEL_GRACE_SECONDS = 2.0


class TaskCancellation:
    def __init__(self, adapter: HermesRuntimeAdapter) -> None:
        self._adapter = adapter
        self._tokens: dict[str, asyncio.Event] = {}

    def request_cancel(self, task_id: str) -> asyncio.Event:
        token = asyncio.Event()
        self._tokens[task_id] = token
        return token

    def is_cancelled(self, task_id: str) -> bool:
        token = self._tokens.get(task_id)
        return token is not None and token.is_set()

    async def execute_cancel(
        self,
        *,
        task_id: str,
        profile_id: str,
        run_id: str | None = None,
        stream_id: str | None = None,
    ) -> dict[str, Any]:
        token = self.request_cancel(task_id)
        token.set()
        try:
            await self._adapter.cancel_run(profile_id, run_id=run_id, stream_id=stream_id)
        except Exception:
            logger.exception("cancel_run_failed", task_id=task_id)
        await asyncio.sleep(CANCEL_GRACE_SECONDS)
        self._tokens.pop(task_id, None)
        return {"taskId": task_id, "cancelled": True}
