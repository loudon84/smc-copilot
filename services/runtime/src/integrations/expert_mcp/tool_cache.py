from __future__ import annotations

import time
from typing import Any


class ExpertMcpToolCache:
    """In-memory tool list cache (60s TTL)."""

    def __init__(self, *, ttl_sec: float = 60.0) -> None:
        self._ttl = ttl_sec
        self._tools: list[dict[str, Any]] = []
        self._fetched_at: float | None = None

    def get(self) -> list[dict[str, Any]] | None:
        if self._fetched_at is None:
            return None
        if time.monotonic() - self._fetched_at > self._ttl:
            return None
        return list(self._tools)

    def set(self, tools: list[dict[str, Any]]) -> None:
        self._tools = list(tools)
        self._fetched_at = time.monotonic()

    def clear(self) -> None:
        self._tools = []
        self._fetched_at = None

    @property
    def count(self) -> int:
        return len(self._tools)
