from __future__ import annotations

import json
from pathlib import Path

from _modules import smc_hermes


def test_inspect_missing_home(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "missing-hermes"))
    monkeypatch.delenv("SMC_HERMES_CONTROL_OWNER", raising=False)
    info = smc_hermes.inspect(hermes_home=str(tmp_path / "missing-hermes"))
    assert info["installed"] is False
    assert info["repo_exists"] is False


def test_install_from_fixture(tmp_path: Path, monkeypatch) -> None:
    owner = tmp_path / "control-owner.json"
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(owner))
    artifact = tmp_path / "artifact"
    (artifact / "hermes_cli").mkdir(parents=True)
    (artifact / "hermes_cli" / "main.py").write_text("# fixture\n", encoding="utf-8")
    (artifact / "venv" / "Scripts").mkdir(parents=True)
    (artifact / "venv" / "Scripts" / "python.exe").write_text("", encoding="utf-8")
    home = tmp_path / "hermes-home"
    result = smc_hermes.install(version="0.16.0", artifact_path=str(artifact), hermes_home=str(home))
    assert result["ok"] is True
    assert (home / "hermes-agent" / "hermes_cli" / "main.py").is_file()
    active = json.loads((home / "active.json").read_text(encoding="utf-8"))
    assert active["version"] == "0.16.0"
    assert smc_hermes.version(hermes_home=str(home))["version"] == "0.16.0"


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
