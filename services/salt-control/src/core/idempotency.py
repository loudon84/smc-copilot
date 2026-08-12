from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from typing import Any


@dataclass
class IdempotencyStore:
    """In-process requestId → response snapshot store (tests / single-process lab)."""

    _entries: dict[str, Any] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def get(self, request_id: str) -> Any | None:
        with self._lock:
            return self._entries.get(request_id)

    def put(self, request_id: str, value: Any) -> Any:
        with self._lock:
            existing = self._entries.get(request_id)
            if existing is not None:
                return existing
            self._entries[request_id] = value
            return value

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
