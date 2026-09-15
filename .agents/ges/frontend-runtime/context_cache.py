"""Content-addressed context cache for targeted / cache-first reads."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any


def content_sha256(text: str | bytes) -> str:
    if isinstance(text, str):
        text = text.encode("utf-8")
    return hashlib.sha256(text).hexdigest()


def make_key(app_id: str, path: str, sha: str) -> str:
    return f"{app_id}|{path}|{sha}"


@dataclass
class ContextCache:
    """In-memory cache keyed by app_id + path + content_sha256."""

    _store: dict[str, Any] = field(default_factory=dict)
    hits: int = 0
    misses: int = 0

    # @lat: [[frontend-context#Context Cache]]
    def get(self, app_id: str, path: str, content_sha256: str) -> Any | None:
        key = make_key(app_id, path, content_sha256)
        if key in self._store:
            self.hits += 1
            return self._store[key]
        self.misses += 1
        return None

    def put(self, app_id: str, path: str, content_sha256: str, value: Any) -> str:
        key = make_key(app_id, path, content_sha256)
        self._store[key] = value
        return key

    def invalidate(self, app_id: str | None = None, path: str | None = None) -> int:
        if app_id is None and path is None:
            n = len(self._store)
            self._store.clear()
            return n
        remove: list[str] = []
        for key in self._store:
            parts = key.split("|", 2)
            if len(parts) != 3:
                continue
            kid, kpath, _ = parts
            if app_id is not None and kid != app_id:
                continue
            if path is not None and kpath != path:
                continue
            remove.append(key)
        for key in remove:
            del self._store[key]
        return len(remove)

    def cache_first_read(self, app_id: str, path: str, content: str | bytes) -> tuple[Any | None, bool]:
        """Return (value, hit). Caller supplies content; miss returns (None, False)."""
        sha = content_sha256(content)
        value = self.get(app_id, path, sha)
        return value, value is not None


# Module-level default cache for simple get/put helpers.
_DEFAULT = ContextCache()


def get(app_id: str, path: str, content_sha256: str) -> Any | None:
    return _DEFAULT.get(app_id, path, content_sha256)


def put(app_id: str, path: str, content_sha256: str, value: Any) -> str:
    return _DEFAULT.put(app_id, path, content_sha256, value)


def invalidate(app_id: str | None = None, path: str | None = None) -> int:
    return _DEFAULT.invalidate(app_id=app_id, path=path)


def reset_default() -> None:
    _DEFAULT.invalidate()
    _DEFAULT.hits = 0
    _DEFAULT.misses = 0
