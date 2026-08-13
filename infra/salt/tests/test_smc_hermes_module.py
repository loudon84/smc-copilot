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


def test_install_adopts_existing_home_without_mutation(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    home = tmp_path / "hermes-home"
    scripts = home / "hermes-agent" / "venv" / "Scripts"
    scripts.mkdir(parents=True)
    (scripts / "python.exe").write_text("", encoding="utf-8")
    (scripts / "hermes.exe").write_text("", encoding="utf-8")
    result = smc_hermes.install(version="0.20.0", hermes_home=str(home), migrate_mode=True)
    assert result["ok"] is True
    assert result["changed"] is False
    assert result["adopted"] is True
    assert not (tmp_path / "owner.json").exists()


def test_doctor_and_health_without_gateway(tmp_path: Path, monkeypatch) -> None:
    owner = tmp_path / "control-owner.json"
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(owner))
    home = tmp_path / "hermes-home"
    home.mkdir()
    (home / "hermes-agent").mkdir()
    report = smc_hermes.doctor(hermes_home=str(home))
    assert report["ok"] is False
    assert report["state"] == "waiting_user_binding"
    assert report["checks"]["gateway_task_user_bound"] is False
    assert report["handover_ready"] is False
    health = smc_hermes.health(hermes_home=str(home), gateway_url="http://127.0.0.1:9")
    assert health["gateway_healthy"] is False


def test_doctor_binding_aware_ready_for_handover(tmp_path: Path, monkeypatch) -> None:
    owner = tmp_path / "control-owner.json"
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(owner))
    home = tmp_path / "hermes-home"
    scripts = home / "hermes-agent" / "venv" / "Scripts"
    scripts.mkdir(parents=True)
    (scripts / "python.exe").write_text("", encoding="utf-8")
    (scripts / "hermes.exe").write_text("", encoding="utf-8")
    (home / "config.yaml").write_text("platforms: {}\n", encoding="utf-8")
    (home / ".env").write_text("", encoding="utf-8")
    monkeypatch.setattr(
        smc_hermes,
        "_gateway_task_info",
        lambda: {"exists": True, "user": r"DOMAIN\alice", "command": str(home)},
    )
    monkeypatch.setattr(
        smc_hermes,
        "health",
        lambda **kwargs: {"gateway_healthy": True},
    )
    report = smc_hermes.doctor(
        expected_windows_account=r"DOMAIN\alice",
        expected_windows_sid="S-1-5-21-1",
        expected_profile_dir=r"C:\Users\alice",
        expected_hermes_home=str(home),
    )
    assert report["agent_ready"] is True
    assert report["gateway_ready"] is True
    assert report["handover_ready"] is True
    assert report["state"] == "ready_for_handover"
    assert report["ok"] is True


def test_module_without_explicit_home_reports_unresolved(monkeypatch) -> None:
    def fail_layout(_home=None):
        raise RuntimeError("hermes_home_unresolved")

    utils = dict(smc_hermes.__utils__)
    utils["smc_paths.layout"] = fail_layout
    monkeypatch.setattr(smc_hermes, "__utils__", utils)
    inspected = smc_hermes.inspect()
    diagnosed = smc_hermes.doctor()
    assert inspected["error"] == "hermes_home_unresolved"
    assert diagnosed["state"] == "waiting_user_binding"
    assert diagnosed["handover_ready"] is False


def test_diagnostics_resolve_binding_from_pillar(tmp_path: Path, monkeypatch) -> None:
    home = tmp_path / "hermes-home"
    home.mkdir()
    monkeypatch.setattr(
        smc_hermes,
        "__pillar__",
        {
            "smc": {
                "user": {
                    "windows_account": r"DOMAIN\alice",
                    "windows_sid": "S-1-5-21-1",
                    "profile_dir": r"C:\Users\alice",
                },
                "hermes": {"home": str(home)},
            }
        },
        raising=False,
    )
    monkeypatch.setattr(smc_hermes, "_gateway_task_info", lambda: {"exists": False, "user": None, "command": None})
    monkeypatch.setattr(smc_hermes, "health", lambda **kwargs: {"gateway_healthy": False})
    assert smc_hermes.inspect()["home"] == str(home)
    report = smc_hermes.doctor()
    assert report["checks"]["binding_complete"] is True
    assert report["state"] == "agent_not_ready"
