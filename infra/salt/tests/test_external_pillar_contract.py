from __future__ import annotations

import io
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from _pillar import smc_external


def _token_file(tmp_path: Path, value: str = "secret-token") -> Path:
    path = tmp_path / "token"
    path.write_text(value, encoding="utf-8")
    return path


def _pubkey_file(tmp_path: Path, value: str = "pubkey") -> Path:
    path = tmp_path / "trusted.pub"
    path.write_text(value, encoding="utf-8")
    return path


def _config(tmp_path: Path, **overrides) -> dict:
    cfg = {
        "salt_control_url": "https://salt-control.example",
        "token_file": str(_token_file(tmp_path)),
        "trusted_key_id": "smc-prod-key",
        "trusted_public_key_file": str(_pubkey_file(tmp_path)),
    }
    cfg.update(overrides)
    return cfg


def test_hostname_minion_requires_identity_adoption(tmp_path: Path) -> None:
    pillar = smc_external.ext_pillar("ITBJB0676", {}, **_config(tmp_path))
    assert pillar["smc"] == {}
    assert pillar["smc_pillar_error"] == "identity_adoption_required"
    assert "secret-token" not in json.dumps(pillar)


def test_http_url_fail_closed_in_production(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SALT_ENV", "production")
    pillar = smc_external.ext_pillar("ep_one", {}, **_config(tmp_path, salt_control_url="http://salt-control.example"))
    assert pillar["smc"] == {}
    assert pillar["smc_pillar_error"] == "https_required"


def test_camelcase_to_snake_and_artifact_merge(tmp_path: Path) -> None:
    desired = {
        "endpointId": "ep_one",
        "revision": "rev1",
        "user": {
            "userId": "u1",
            "windowsAccount": r"DOMAIN\alice",
            "windowsSid": "S-1-5-21-1",
            "profileDir": r"C:\Users\alice",
        },
        "hermes": {"home": r"C:\Users\alice\AppData\Local\hermes", "version": "0.20.0", "artifactRef": "hermes/0.20.0"},
        "profiles": [],
        "mcp": {},
        "secrets": [],
        "rollout": {"ring": "ring0", "desiredOwner": "salt"},
    }
    artifact = {
        "url": "https://artifacts.example/hermes.zip",
        "sha256": "ab" * 32,
        "manifestSignature": "sig",
        "keyId": "smc-prod-key",
    }

    def fake_open(req, timeout=5.0):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        auth = req.get_header("Authorization") if hasattr(req, "get_header") else req.headers.get("Authorization")
        assert auth == "Bearer secret-token"
        payload = artifact if "/artifacts/" in url else desired
        body = json.dumps(payload).encode("utf-8")
        resp = MagicMock()
        resp.read.return_value = body
        resp.__enter__.return_value = resp
        resp.__exit__.return_value = False
        return resp

    with patch("urllib.request.urlopen", side_effect=fake_open):
        pillar = smc_external.ext_pillar("ep_one", {}, **_config(tmp_path))
    smc = pillar["smc"]
    assert smc["endpoint_id"] == "ep_one"
    assert smc["user"]["windows_account"] == r"DOMAIN\alice"
    assert smc["hermes"]["artifact_ref"]
    assert smc["hermes"]["artifact"]["url"] == "https://artifacts.example/hermes.zip"
    assert smc["hermes"]["artifact"]["signature"] == "sig"
    assert smc["hermes"]["artifact"]["public_key"] == "pubkey"
    dumped = json.dumps(pillar)
    assert "secret-token" not in dumped
    assert "Bearer" not in dumped


def test_fail_closed_on_auth_and_bad_payload(tmp_path: Path) -> None:
    import urllib.error

    def http_error(code: int):
        def _open(req, timeout=5.0):
            raise urllib.error.HTTPError(req.full_url, code, "nope", hdrs=None, fp=io.BytesIO())

        return _open

    with patch("urllib.request.urlopen", side_effect=http_error(401)):
        pillar = smc_external.ext_pillar("ep_one", {}, **_config(tmp_path))
    assert pillar["smc"] == {}
    assert pillar["smc_pillar_error"] == "auth_failed"
    assert "secret-token" not in json.dumps(pillar)

    with patch("urllib.request.urlopen", side_effect=http_error(404)):
        pillar = smc_external.ext_pillar("ep_one", {}, **_config(tmp_path))
    assert pillar["smc_pillar_error"] == "not_found"


def test_key_id_mismatch_fail_closed(tmp_path: Path) -> None:
    desired = {
        "endpointId": "ep_one",
        "revision": "rev1",
        "user": {
            "userId": "u1",
            "windowsAccount": r"DOMAIN\alice",
            "windowsSid": "S-1-5-21-1",
            "profileDir": r"C:\Users\alice",
        },
        "hermes": {"home": r"C:\h", "version": "0.20.0", "artifactRef": "x"},
    }
    artifact = {"url": "https://a", "sha256": "ab" * 32, "manifestSignature": "sig", "keyId": "other-key"}

    def fake_open(req, timeout=5.0):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        payload = artifact if "/artifacts/" in url else desired
        resp = MagicMock()
        resp.read.return_value = json.dumps(payload).encode("utf-8")
        resp.__enter__.return_value = resp
        resp.__exit__.return_value = False
        return resp

    with patch("urllib.request.urlopen", side_effect=fake_open):
        pillar = smc_external.ext_pillar("ep_one", {}, **_config(tmp_path))
    assert pillar["smc"] == {}
    assert pillar["smc_pillar_error"] == "key_id_mismatch"
