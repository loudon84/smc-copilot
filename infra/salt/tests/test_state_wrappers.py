from __future__ import annotations

from _states import smc_hermes as state_mod


def test_installed_test_mode(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": True})
    ret = state_mod.installed("hermes", version="0.16.0")
    assert ret["result"] is None


def test_installed_calls_execution(monkeypatch) -> None:
    monkeypatch.setattr(state_mod, "_opts", lambda: {"test": False})
    monkeypatch.setattr(
        state_mod,
        "_salt",
        lambda: {"smc_hermes.install": lambda **kwargs: {"ok": True, "version": kwargs["version"]}},
    )
    ret = state_mod.installed("hermes", version="0.16.0", artifact_path="/tmp/a")
    assert ret["result"] is True
    assert ret["changes"]["version"] == "0.16.0"
