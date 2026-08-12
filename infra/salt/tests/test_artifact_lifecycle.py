from __future__ import annotations

import json
from pathlib import Path

from _modules import smc_hermes
from _utils.artifact import hmac_signature, sha256_file
from conftest import SIGNING_KEY, make_signed_zip


def test_install_signed_artifact(tmp_path: Path, monkeypatch, signed_artifact) -> None:
    zip_path, sha256, signature = signed_artifact
    owner = tmp_path / "control-owner.json"
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(owner))
    monkeypatch.setenv("SMC_ARTIFACT_SIGNING_KEY", SIGNING_KEY)
    home = tmp_path / "hermes-home"
    result = smc_hermes.install(
        version="0.20.0",
        artifact_path=str(zip_path),
        artifact_sha256=sha256,
        artifact_signature=signature,
        hermes_home=str(home),
    )
    assert result["ok"] is True
    assert (home / "hermes-agent" / "hermes_cli" / "main.py").is_file()
    active = json.loads((home / "active.json").read_text(encoding="utf-8"))
    assert active["version"] == "0.20.0"
    assert smc_hermes.version(hermes_home=str(home))["version"] == "0.20.0"


def test_checksum_mismatch_rejected(tmp_path: Path, monkeypatch, signed_artifact) -> None:
    zip_path, _sha, signature = signed_artifact
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    monkeypatch.setenv("SMC_ARTIFACT_SIGNING_KEY", SIGNING_KEY)
    result = smc_hermes.install(
        version="0.20.0",
        artifact_path=str(zip_path),
        artifact_sha256="0" * 64,
        artifact_signature=signature,
        hermes_home=str(tmp_path / "h"),
    )
    assert result["ok"] is False
    assert result["error"] == "checksum_mismatch"


def test_signature_invalid_rejected(tmp_path: Path, monkeypatch, signed_artifact) -> None:
    zip_path, sha256, _sig = signed_artifact
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    monkeypatch.setenv("SMC_ARTIFACT_SIGNING_KEY", SIGNING_KEY)
    result = smc_hermes.install(
        version="0.20.0",
        artifact_path=str(zip_path),
        artifact_sha256=sha256,
        artifact_signature="deadbeef" * 8,
        hermes_home=str(tmp_path / "h"),
    )
    assert result["ok"] is False
    assert result["error"] == "signature_invalid"


def test_upgrade_and_rollback(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    monkeypatch.setenv("SMC_ARTIFACT_SIGNING_KEY", SIGNING_KEY)
    home = tmp_path / "h"
    v1, sha1, sig1 = make_signed_zip(tmp_path / "v1", version="0.19.0")
    v2, sha2, sig2 = make_signed_zip(tmp_path / "v2", version="0.20.0")
    first = smc_hermes.install(
        version="0.19.0",
        artifact_path=str(v1),
        artifact_sha256=sha1,
        artifact_signature=sig1,
        hermes_home=str(home),
    )
    assert first["ok"] is True
    upgraded = smc_hermes.upgrade(
        version="0.20.0",
        artifact_path=str(v2),
        artifact_sha256=sha2,
        artifact_signature=sig2,
        hermes_home=str(home),
    )
    assert upgraded["ok"] is True
    assert upgraded["previous_version"] == "0.19.0"
    rolled = smc_hermes.rollback(version="0.19.0", hermes_home=str(home))
    assert rolled["ok"] is True
    assert smc_hermes.version(hermes_home=str(home))["version"] == "0.19.0"


def test_hmac_helpers_roundtrip(tmp_path: Path, signed_artifact) -> None:
    zip_path, sha256, signature = signed_artifact
    assert sha256_file(zip_path) == sha256
    assert hmac_signature(zip_path.read_bytes(), SIGNING_KEY) == signature
