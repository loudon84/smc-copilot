from __future__ import annotations

from _grains import smc_endpoint


def test_grain_has_no_current_user_sot(monkeypatch) -> None:
    monkeypatch.setenv("USERNAME", "should-not-appear")
    monkeypatch.setenv("USER", "should-not-appear")
    monkeypatch.delenv("HERMES_HOME", raising=False)
    facts = smc_endpoint.smc_endpoint()["smc_endpoint"]
    assert "user" not in facts
    assert "windows_account" not in facts
    assert facts["hostname"]
    assert facts["platform"]
    assert facts["arch"]
