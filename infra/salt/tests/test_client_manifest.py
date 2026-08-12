from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from client.manifest import ManifestError, load_manifest, validate_manifest, verify_installer_sha256

MANIFEST = Path(__file__).resolve().parents[1] / "manifest" / "client-manifest.json"


def test_repo_manifest_is_pinned_3008_lts() -> None:
    payload = load_manifest(MANIFEST)
    assert payload["schema"] == "smc.salt-client.v1"
    assert payload["salt"]["channel"] == "3008-lts"
    assert payload["salt"]["version"] == "3008.2"
    assert payload["salt"]["version"].lower() != "latest"
    assert len(payload["salt"]["sha256"]) == 64


def test_rejects_latest_version() -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    payload["salt"]["version"] = "latest"
    with pytest.raises(ManifestError, match="latest"):
        validate_manifest(payload)


def test_rejects_bad_sha256() -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    payload["salt"]["sha256"] = "not-a-digest"
    with pytest.raises(ManifestError, match="sha256"):
        validate_manifest(payload)


def test_verify_installer_sha256(tmp_path: Path) -> None:
    blob = tmp_path / "Salt-Minion-3008.2-Py3-AMD64.msi"
    blob.write_bytes(b"fixture-msi")
    digest = hashlib.sha256(b"fixture-msi").hexdigest()
    assert verify_installer_sha256(blob, digest) is True
    assert verify_installer_sha256(blob, "0" * 64) is False
