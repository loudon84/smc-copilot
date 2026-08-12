from __future__ import annotations

import json
from pathlib import Path

from _modules import smc_secret
from _returners import smc_backend


def test_resolve_without_reveal_omits_value(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SECRET_CACHE", str(tmp_path / "cache"))
    monkeypatch.setenv("SMC_SALT_ENV", "lab")
    smc_secret.__opts__ = {"smc_secret_store": {"smc://providers/dashscope": "super-secret"}}
    try:
        result = smc_secret.resolve("smc://providers/dashscope", reveal=False)
        assert result["ok"] is True
        assert "value" not in result
        assert result["ref"] == "smc://providers/dashscope"
    finally:
        smc_secret.__opts__ = {}


def test_reveal_forbidden_in_production(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SALT_ENV", "production")
    smc_secret.__opts__ = {"smc_secret_store": {"smc://providers/dashscope": "super-secret"}}
    try:
        result = smc_secret.resolve("smc://providers/dashscope", reveal=True)
        assert result["ok"] is False
        assert result["error"] == "reveal_forbidden_in_production"
    finally:
        smc_secret.__opts__ = {}


def test_materialize_writes_env_without_returning_secrets(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SECRET_CACHE", str(tmp_path / "cache"))
    monkeypatch.setenv("SMC_SALT_ENV", "lab")
    smc_secret.__opts__ = {"smc_secret_store": {"smc://providers/dashscope": "super-secret"}}
    env_path = tmp_path / "hermes" / ".env"
    try:
        result = smc_secret.materialize(["smc://providers/dashscope"], env_path)
        assert result["ok"] is True
        assert "value" not in json.dumps(result)
        text = env_path.read_text(encoding="utf-8")
        assert "super-secret" in text
        assert result["results"][0]["status"] == "ok"
    finally:
        smc_secret.__opts__ = {}


def test_materialize_via_salt_control_mock(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SALT_ENV", "production")
    monkeypatch.setenv("SMC_SALT_CONTROL_URL", "https://salt-control.test")

    def fake_resolve(refs: list[str], endpoint_id: str, user_id: str) -> dict[str, str]:
        assert refs == ["smc://providers/dashscope"]
        assert endpoint_id == "ep_1"
        return {"smc://providers/dashscope": "from-api"}

    monkeypatch.setattr(smc_secret, "_resolve_via_salt_control", fake_resolve)
    env_path = tmp_path / ".env"
    result = smc_secret.materialize(
        ["smc://providers/dashscope"],
        env_path,
        endpoint_id="ep_1",
        user_id="u_1",
    )
    assert result["ok"] is True
    assert "from-api" in env_path.read_text(encoding="utf-8")


def test_returner_https_batch(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SALT_ENV", "production")
    monkeypatch.setenv("SMC_SALT_CONTROL_URL", "https://salt-control.test")
    posted: list[dict] = []

    def fake_post(items: list[dict]) -> bool:
        posted.extend(items)
        return True

    monkeypatch.setattr(smc_backend, "_post_batch", fake_post)
    ok = smc_backend.returner(
        {
            "jid": "9",
            "id": "ep_1",
            "fun": "smc_hermes.inspect",
            "success": True,
            "return": {"token": "plain-secret"},
        }
    )
    assert ok is True
    assert posted[0]["payloadRedacted"]["token"] == "***"
    assert "plain-secret" not in json.dumps(posted)


def test_returner_spool_on_failure(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SALT_ENV", "production")
    monkeypatch.setenv("SMC_SALT_CONTROL_URL", "https://salt-control.test")
    monkeypatch.setenv("SMC_SALT_RETURN_SPOOL", str(tmp_path / "spool"))

    def boom(items: list[dict]) -> bool:
        raise ConnectionError("down")

    monkeypatch.setattr(smc_backend, "_post_batch", boom)
    ok = smc_backend.returner({"jid": "1", "id": "ep_1", "fun": "test.ping", "success": True, "return": {}})
    assert ok is False
    assert list((tmp_path / "spool").glob("*.bin"))
