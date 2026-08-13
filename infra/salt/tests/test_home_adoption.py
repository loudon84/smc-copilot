from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from _modules import smc_hermes
from plugin_loader import load_named_util

detect_existing_home = load_named_util("smc_paths").detect_existing_home
paths_util = load_named_util("smc_paths")


def _mark_home(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "config.yaml").write_text("platforms: {}\n", encoding="utf-8")
    (path / ".env").write_text("API_SERVER_KEY=x\n", encoding="utf-8")
    (path / "profiles").mkdir(exist_ok=True)
    (path / "sessions").mkdir(exist_ok=True)


def test_detect_prefers_configured_home(tmp_path: Path) -> None:
    configured = tmp_path / "configured-hermes"
    local = tmp_path / "Local" / "hermes"
    profile = tmp_path / "User" / ".hermes"
    _mark_home(configured)
    _mark_home(local)
    _mark_home(profile)
    found = detect_existing_home(
        configured=str(configured),
        localappdata=str(tmp_path / "Local"),
        userprofile=str(tmp_path / "User"),
    )
    assert found == configured


def test_detect_runtime_metadata(tmp_path: Path) -> None:
    home = tmp_path / "runtime-hermes"
    _mark_home(home)
    meta = tmp_path / "runtime-active.json"
    meta.write_text(json.dumps({"hermes_home": str(home)}), encoding="utf-8")
    found = detect_existing_home(runtime_metadata=str(meta))
    assert found == home


def test_adopt_home_does_not_create_second(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SMC_CONTROL_OWNER_PATH", str(tmp_path / "owner.json"))
    missing = smc_hermes.adopt_home(
        configured=str(tmp_path / "nope"),
        localappdata=str(tmp_path / "no-local"),
        userprofile=str(tmp_path / "no-profile"),
    )
    assert missing["ok"] is False
    assert missing["create_second_home"] is False
    home = tmp_path / "existing"
    _mark_home(home)
    adopted = smc_hermes.adopt_home(configured=str(home))
    assert adopted["ok"] is True
    assert adopted["create_second_home"] is False
    assert adopted["home"] == str(home)


def test_windows_system_profile_default_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.delenv("HERMES_HOME", raising=False)
    monkeypatch.setenv("USERNAME", "SYSTEM")
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Windows\System32\config\systemprofile\AppData\Local")
    monkeypatch.setenv("USERPROFILE", r"C:\Windows\System32\config\systemprofile")
    with pytest.raises(RuntimeError, match="hermes_home_unresolved"):
        paths_util.layout()


def test_explicit_non_system_home_is_allowed_for_system_service(monkeypatch) -> None:
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("USERNAME", "SYSTEM")
    selected = paths_util.layout(r"C:\Users\alice\AppData\Local\hermes")
    assert str(selected.home) == r"C:\Users\alice\AppData\Local\hermes"


def test_detect_never_adopts_system_profile(monkeypatch) -> None:
    system_home = Path(r"C:\Windows\System32\config\systemprofile\AppData\Local\hermes")
    monkeypatch.setattr(paths_util, "looks_like_hermes_home", lambda _path: True)
    assert paths_util.detect_existing_home(configured=str(system_home), localappdata="", userprofile="") is None
