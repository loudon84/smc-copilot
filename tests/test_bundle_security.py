"""Tests for secure runtime-bundle extraction (PRD v1.6 FR-005)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from runtime.bundle_security import (
    BundleSecurityError,
    safe_extract_zip,
    validate_zip_members,
    verify_bundle_artifact,
)


def _make_zip(path: Path, entries: dict[str, bytes], *, manifest: dict | None = None) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
        if manifest is not None:
            zf.writestr("manifest.json", json.dumps(manifest).encode("utf-8"))


# @lat: [[tests#Runtime Service Update#Rejects zip slip on maintenance extract]]
def test_rejects_zip_slip(tmp_path: Path) -> None:
    artifact = tmp_path / "bad.zip"
    _make_zip(artifact, {"../evil.txt": b"x"})
    with pytest.raises(BundleSecurityError, match="traversal|absolute"):
        validate_zip_members(artifact)


# @lat: [[tests#Runtime Service Update#Rejects ADS and symlink members]]
def test_rejects_ads_path(tmp_path: Path) -> None:
    artifact = tmp_path / "ads.zip"
    _make_zip(artifact, {"readme.txt:secret": b"hidden"})
    with pytest.raises(BundleSecurityError, match="ADS"):
        validate_zip_members(artifact)


def test_safe_extract_and_manifest(tmp_path: Path) -> None:
    artifact = tmp_path / "ok.zip"
    manifest = {
        "name": "runtime-bundle",
        "version": "1.6.0",
        "platform": "windows",
        "architecture": "x86_64",
        "placeholder": False,
    }
    _make_zip(artifact, {"runtime/a.txt": b"hello"}, manifest=manifest)
    dest = tmp_path / "out"
    safe_extract_zip(artifact, dest)
    assert (dest / "runtime" / "a.txt").read_text(encoding="utf-8") == "hello"
    loaded = verify_bundle_artifact(artifact, expected_version="1.6.0")
    assert loaded["version"] == "1.6.0"


def test_rejects_placeholder_bundle(tmp_path: Path) -> None:
    artifact = tmp_path / "ph.zip"
    manifest = {
        "version": "1.6.0",
        "platform": "windows",
        "architecture": "x86_64",
        "placeholder": True,
    }
    _make_zip(artifact, {"runtime/a.txt": b"x"}, manifest=manifest)
    with pytest.raises(BundleSecurityError, match="placeholder"):
        verify_bundle_artifact(artifact)
