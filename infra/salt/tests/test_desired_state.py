from __future__ import annotations

from _pillar import smc_external
from _utils.redact import redact_mapping

from mock_backend.desired_state import resolve_desired_state


def test_demo_user_binding() -> None:
    state = resolve_desired_state("lab-minion-01")
    assert state["user_id"] == "user-demo"
    assert state["config_version"] == "1"
    assert state["user_switched"] is False
    assert state["secret_refs"]["api_server_key"] == "smc://providers/dashscope"


def test_user_switch_does_not_reuse_previous_policy() -> None:
    state = resolve_desired_state("lab-minion-02", user_id="user-alt")
    assert state["user_id"] == "user-alt"
    assert state["user_switched"] is True
    assert state["config_version"] == "2"
    assert state["secret_refs"]["api_server_key"] == "smc://providers/dashscope-alt"


def test_ext_pillar_injected_resolver() -> None:
    smc_external.__opts__ = {
        "smc_desired_state_resolver": lambda endpoint_id, user_id: resolve_desired_state(endpoint_id, user_id)
    }
    try:
        pillar = smc_external.ext_pillar("lab-minion-01", {})
        assert pillar["smc"]["endpoint_id"] == "lab-minion-01"
        assert pillar["smc_pillar_source"] == "injected"
    finally:
        smc_external.__opts__ = {}


def test_redact_secrets() -> None:
    payload = redact_mapping({"api_key": "secret-value", "port": 8642})
    assert payload["api_key"] == "***"
    assert payload["port"] == 8642
