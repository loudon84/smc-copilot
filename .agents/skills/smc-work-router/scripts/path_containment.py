#!/usr/bin/env python3
"""Repo-relative path containment for Work Facts source_ref (C01-grade)."""
from __future__ import annotations

import os
from pathlib import Path, PurePosixPath, PureWindowsPath


class PathContainmentError(ValueError):
    """Fail-closed path containment violation."""


def _norm_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def _inside(root_key: str, candidate_key: str) -> bool:
    return candidate_key == root_key or candidate_key.startswith(root_key + os.sep)


def _segments(logical: str) -> list[str]:
    return logical.replace("\\", "/").split("/")


def safe_repo_relative(repo: Path, rel: object, *, code: str = "WORK_FACTS_SOURCE_PATH_INVALID") -> Path:
    # @lat: [[safety-runtime-closure-v503]]
    """Resolve a repo-relative path with C01-grade containment; never escapes repo."""
    if not isinstance(rel, str) or not rel.strip():
        raise PathContainmentError(code)
    text = rel.strip()
    if text.startswith("\\\\") or text.startswith("//"):
        raise PathContainmentError(code)
    win = PureWindowsPath(text)
    if win.drive or win.root or PurePosixPath(text.replace("\\", "/")).is_absolute():
        raise PathContainmentError(code)
    segs = _segments(text)
    if not segs or any(s in {"", ".", ".."} for s in segs):
        raise PathContainmentError(code)
    root = repo.resolve()
    root_key = _norm_key(root)
    cursor = root
    for part in segs:
        cursor = cursor / part
        if cursor.exists() or cursor.is_symlink():
            try:
                resolved = cursor.resolve()
            except OSError as exc:
                raise PathContainmentError(code) from exc
            if not _inside(root_key, _norm_key(resolved)):
                raise PathContainmentError(code)
    final = cursor.resolve(strict=False)
    final_key = _norm_key(final)
    if final_key == root_key or not _inside(root_key, final_key):
        raise PathContainmentError(code)
    return final
