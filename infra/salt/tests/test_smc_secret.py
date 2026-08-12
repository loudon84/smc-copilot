from __future__ import annotations

from pathlib import Path

from _modules import smc_secret
from _returners import smc_backend


def test_resolve_without_reveal_omits_value(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SECRET_CACHE", str(tmp_path / "cache"))
    smc_secret.__opts__ = {"smc_secret_store": {"smc://providers/dashscope": "super-secret"}}
    try:
        result = smc_secret.resolve("smc://providers/dashscope", reveal=False)
        assert result["ok"] is True
        assert "value" not in result
        assert result["ref"] == "smc://providers/dashscope"
    finally:
        smc_secret.__opts__ = {}


def test_resolve_reveal_for_local_apply_only(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_SECRET_CACHE", str(tmp_path / "cache"))
    smc_secret.__opts__ = {"smc_secret_store": {"smc://providers/dashscope": "super-secret"}}
    try:
        result = smc_secret.resolve("smc://providers/dashscope", reveal=True)
        assert result["value"] == "super-secret"
        redacted = smc_secret.redact_return({"api_key": result["value"], "ref": result["ref"]})
        assert redacted["api_key"] == "***"
    finally:
        smc_secret.__opts__ = {}


def test_returner_never_writes_secret_plaintext(tmp_path: Path, monkeypatch) -> None:
    sink = tmp_path / "jobs.jsonl"
    monkeypatch.setenv("SMC_SALT_RETURN_SINK", str(sink))
    smc_backend.returner(
        {
            "jid": "2",
            "id": "ep_1",
            "fun": "smc_secret.resolve",
            "success": True,
            "return": {"token": "plain-secret", "ref": "smc://providers/dashscope"},
        }
    )
    text = sink.read_text(encoding="utf-8")
    assert "plain-secret" not in text
    assert "***" in text
