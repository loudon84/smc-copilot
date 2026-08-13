from __future__ import annotations

from _states import smc_hermes as state_mod


def test_installed_test_mode(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": True})
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {
            "smc_hermes.inspect": lambda **kwargs: {"installed": False},
            "smc_hermes.version": lambda **kwargs: {"version": None},
        },
    )
    ret = state_mod.installed("hermes", version="0.16.0")
    assert ret["result"] is None


def test_installed_calls_execution(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": False})
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {
            "smc_hermes.inspect": lambda **kwargs: {"installed": False},
            "smc_hermes.version": lambda **kwargs: {"version": None},
            "smc_hermes.install": lambda **kwargs: {"ok": True, "version": kwargs["version"]},
        },
    )
    ret = state_mod.installed("hermes", version="0.16.0", artifact_path="/tmp/a")
    assert ret["result"] is True
    assert ret["changes"]["version"] == "0.16.0"


def test_prepared_adopts_existing_home_without_install(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": False})
    calls = []
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {
            "smc_hermes.inspect": lambda **kwargs: {"installed": True},
            "smc_hermes.version": lambda **kwargs: {"version": None},
            "smc_hermes.install": lambda **kwargs: calls.append(kwargs) or {"ok": True},
        },
    )
    ret = state_mod.prepared("hermes", version="0.20.0", hermes_home="C:/Users/a/AppData/Local/hermes")
    assert ret["result"] is True
    assert ret["changes"] == {}
    assert "adopted" in ret["comment"]
    assert calls == []


def test_installed_same_version_is_idempotent(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": False})
    calls = []
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {
            "smc_hermes.inspect": lambda **kwargs: {"installed": True},
            "smc_hermes.version": lambda **kwargs: {"version": "0.20.0"},
            "smc_hermes.install": lambda **kwargs: calls.append(kwargs) or {"ok": True},
        },
    )
    ret = state_mod.installed("hermes", version="0.20.0", hermes_home="C:/h")
    assert ret["result"] is True
    assert ret["changes"] == {}
    assert calls == []
