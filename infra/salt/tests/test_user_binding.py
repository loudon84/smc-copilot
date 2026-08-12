from __future__ import annotations

from _pillar import smc_external

from mock_backend.desired_state import resolve_desired_state


def test_desired_state_emits_windows_binding() -> None:
    state = resolve_desired_state("lab-minion-01")
    assert state["user"]["user_id"] == "user-demo"
    assert state["user"]["windows_account"] == r"DOMAIN\zhangsan"
    assert state["user"]["windows_sid"].startswith("S-1-5-")
    assert state["user"]["profile_dir"].endswith(r"\zhangsan")
    assert r"\hermes" in state["hermes"]["home"]


def test_user_switch_does_not_reuse_secret_ref() -> None:
    state = resolve_desired_state("lab-minion-02", user_id="user-alt")
    assert state["user_switched"] is True
    assert state["user"]["windows_account"] == r"DOMAIN\lisi"
    assert state["secret_refs"]["api_server_key"] == "smc://providers/dashscope-alt"


def test_ext_pillar_uses_injected_resolver_not_mock_import() -> None:
    smc_external.__opts__ = {
        "smc_desired_state_resolver": lambda endpoint_id, user_id: resolve_desired_state(endpoint_id, user_id)
    }
    try:
        pillar = smc_external.ext_pillar("lab-minion-01", {})
        assert pillar["smc_pillar_source"] == "injected"
        assert pillar["smc"]["user"]["windows_account"]
    finally:
        smc_external.__opts__ = {}


def test_ext_pillar_backend_unavailable_does_not_clear_with_mock() -> None:
    smc_external.__opts__ = {}
    pillar = smc_external.ext_pillar("lab-minion-01", {})
    assert pillar["smc"] == {}
    assert pillar["smc_pillar_source"] == "backend_unavailable"
    assert "mock" not in pillar["smc_pillar_source"]
