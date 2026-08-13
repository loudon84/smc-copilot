from __future__ import annotations

from _pillar import smc_external
from plugin_loader import load_named_util

from mock_backend.desired_state import resolve_desired_state

redact_mapping = load_named_util("smc_redact").redact_mapping


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
    def _resolve(endpoint_id, user_id):
        data = resolve_desired_state("lab-minion-01", user_id)
        data["endpoint_id"] = endpoint_id
        return data

    smc_external.__opts__ = {"smc_desired_state_resolver": _resolve}
    try:
        pillar = smc_external.ext_pillar("ep_lab_minion_01", {})
        assert pillar["smc"]["endpoint_id"] == "ep_lab_minion_01"
        assert pillar["smc_pillar_source"] == "injected"
    finally:
        smc_external.__opts__ = {}


def test_redact_secrets() -> None:
    payload = redact_mapping({"api_key": "secret-value", "port": 8642})
    assert payload["api_key"] == "***"
    assert payload["port"] == 8642
