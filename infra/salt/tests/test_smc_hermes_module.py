from __future__ import annotations

from pathlib import Path

from _modules import smc_hermes


def test_inspect_missing_home(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "missing-hermes"))
    monkeypatch.delenv("SMC_HERMES_CONTROL_OWNER", raising=False)
    info = smc_hermes.inspect(hermes_home=str(tmp_path / "missing-hermes"))
    assert info["installed"] is False
    assert info["repo_exists"] is False


def test_unsigned_install_rejected(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    result = smc_hermes.install(version="0.20.0", artifact_path=str(tmp_path / "a"), hermes_home=str(tmp_path / "h"))
    assert result["ok"] is False
    assert result["error"] == "signed_artifact_required"


def test_doctor_and_health_without_gateway(tmp_path: Path, monkeypatch) -> None:
    owner = tmp_path / "control-owner.json"
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(owner))
    home = tmp_path / "hermes-home"
    home.mkdir()
    (home / "hermes-agent").mkdir()
    report = smc_hermes.doctor(hermes_home=str(home))
    assert "checks" in report
    health = smc_hermes.health(hermes_home=str(home), gateway_url="http://127.0.0.1:9")
    assert health["gateway_healthy"] is False
