"""Content-addressed context cache for targeted / cache-first reads.

v5.0.8 extends the in-memory app_id|path|sha API with work-item capsules that
bind repo identity, scope, extractor, and policy digests. Capsules may persist
under .smc/runs/<work-item-id>/context/ and are never delivery truth.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ARTIFACT_KINDS = frozenset(
    {"SOURCE", "PRD_SECTION", "PLAN_SECTION", "FEATURE_SCOPE", "TEST_EVIDENCE"}
)


def content_sha256(text: str | bytes) -> str:
    if isinstance(text, str):
        text = text.encode("utf-8")
    return hashlib.sha256(text).hexdigest()


def make_key(app_id: str, path: str, sha: str) -> str:
    return f"{app_id}|{path}|{sha}"


def make_capsule_key(
    *,
    repo_identity: str,
    artifact_kind: str,
    scope_digest: str,
    identity: str,
    content_sha256: str,
    extractor_version: str,
    policy_digest: str,
) -> str:
    parts = [
        str(repo_identity or ""),
        str(artifact_kind or ""),
        str(scope_digest or ""),
        str(identity or "").replace("\\", "/"),
        str(content_sha256 or ""),
        str(extractor_version or ""),
        str(policy_digest or ""),
    ]
    return "|".join(parts)


def _bounded(repo: Path, rel: str) -> Path:
    root = repo.resolve()
    target = (root / rel).resolve()
    if not target.is_relative_to(root):
        raise ValueError("CONTEXT_CACHE_PATH_ESCAPES_ROOT")
    return target


@dataclass
class ContextCache:
    """In-memory cache keyed by app_id + path + content_sha256."""

    _store: dict[str, Any] = field(default_factory=dict)
    hits: int = 0
    misses: int = 0
    stale: int = 0

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


@dataclass
class CapsuleStore:
    """Work-item scoped capsules with optional disk persistence under .smc/runs/."""

    repo: Path
    work_item_id: str
    ttl_seconds: int = 86400
    max_entries: int = 256
    _memory: dict[str, dict[str, Any]] = field(default_factory=dict)
    hits: int = 0
    misses: int = 0
    stale: int = 0

    def root(self) -> Path:
        wid = str(self.work_item_id or "").strip()
        if not wid or any(part in ("", ".", "..") for part in Path(wid).parts) or "/" in wid or "\\" in wid:
            raise ValueError("CONTEXT_CACHE_WORK_ITEM_INVALID")
        return _bounded(self.repo, f".smc/runs/{wid}/context")

    def _path_for(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.root() / f"{digest}.json"

    # @lat: [[adaptive-governance-context-v508#上下文预算与缓存]]
    def get_capsule(
        self,
        *,
        repo_identity: str,
        artifact_kind: str,
        scope_digest: str,
        identity: str,
        content_sha256: str,
        extractor_version: str,
        policy_digest: str,
    ) -> Any | None:
        if artifact_kind not in ARTIFACT_KINDS:
            self.misses += 1
            return None
        key = make_capsule_key(
            repo_identity=repo_identity,
            artifact_kind=artifact_kind,
            scope_digest=scope_digest,
            identity=identity,
            content_sha256=content_sha256,
            extractor_version=extractor_version,
            policy_digest=policy_digest,
        )
        entry = self._memory.get(key)
        if entry is None:
            path = self._path_for(key)
            if path.is_file():
                try:
                    entry = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    self.stale += 1
                    self.misses += 1
                    return None
            else:
                self.misses += 1
                return None
        if not self._fresh(entry, key=key):
            self.stale += 1
            self.misses += 1
            self._memory.pop(key, None)
            return None
        # Re-validate binding fields (CONTEXT_CACHE_STALE on mismatch).
        expected = {
            "repo_identity": repo_identity,
            "artifact_kind": artifact_kind,
            "scope_digest": scope_digest,
            "identity": identity.replace("\\", "/"),
            "content_sha256": content_sha256,
            "extractor_version": extractor_version,
            "policy_digest": policy_digest,
        }
        for k, v in expected.items():
            if entry.get(k) != v:
                self.stale += 1
                self.misses += 1
                return None
        self.hits += 1
        return entry.get("value")

    def put_capsule(
        self,
        *,
        repo_identity: str,
        artifact_kind: str,
        scope_digest: str,
        identity: str,
        content_sha256: str,
        extractor_version: str,
        policy_digest: str,
        value: Any,
        persist: bool = True,
    ) -> str:
        if artifact_kind not in ARTIFACT_KINDS:
            raise ValueError("CONTEXT_CACHE_ARTIFACT_KIND_INVALID")
        # Refuse obvious secret-looking payloads by key name.
        if isinstance(value, dict):
            lowered = {str(k).lower() for k in value}
            if lowered & {"password", "api_key", "token_value", "secret", "authorization"}:
                raise ValueError("CONTEXT_CACHE_SECRET_FORBIDDEN")
        key = make_capsule_key(
            repo_identity=repo_identity,
            artifact_kind=artifact_kind,
            scope_digest=scope_digest,
            identity=identity,
            content_sha256=content_sha256,
            extractor_version=extractor_version,
            policy_digest=policy_digest,
        )
        entry = {
            "key": key,
            "repo_identity": repo_identity,
            "artifact_kind": artifact_kind,
            "scope_digest": scope_digest,
            "identity": identity.replace("\\", "/"),
            "content_sha256": content_sha256,
            "extractor_version": extractor_version,
            "policy_digest": policy_digest,
            "value": value,
            "stored_at": time.time(),
            "ttl_seconds": self.ttl_seconds,
        }
        self._memory[key] = entry
        self._enforce_capacity()
        if persist:
            self._atomic_write(self._path_for(key), entry)
        return key

    def _fresh(self, entry: dict[str, Any], *, key: str) -> bool:
        stored = float(entry.get("stored_at") or 0)
        ttl = int(entry.get("ttl_seconds") or self.ttl_seconds)
        if stored <= 0:
            return False
        if time.time() - stored > ttl:
            return False
        return entry.get("key") == key

    def _enforce_capacity(self) -> None:
        if len(self._memory) <= self.max_entries:
            return
        ordered = sorted(self._memory.items(), key=lambda kv: float(kv[1].get("stored_at") or 0))
        for key, _ in ordered[: max(0, len(self._memory) - self.max_entries)]:
            self._memory.pop(key, None)

    def _atomic_write(self, path: Path, entry: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        raw = json.dumps(entry, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        tmp.write_text(raw, encoding="utf-8", newline="\n")
        os.replace(tmp, path)

    def cleanup(self) -> int:
        """Remove expired disk capsules for this work item; never leave the run root."""
        root = self.root()
        if not root.is_dir():
            return 0
        removed = 0
        for path in root.glob("*.json"):
            try:
                entry = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not self._fresh(entry, key=str(entry.get("key") or "")):
                try:
                    path.unlink()
                    removed += 1
                except OSError:
                    pass
        return removed


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
    _DEFAULT.stale = 0
