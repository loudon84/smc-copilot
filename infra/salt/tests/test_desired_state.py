from __future__ import annotations

from mock_backend.desired_state import resolve_desired_state
from _utils.redact import redact_mapping
from _pillar import smc_external


def test_demo_user_binding() -> None:
    state = resolve_desired_state("lab-minion-01")
    assert state["user_id"] == "user-demo"
    assert state["config_version"] == "1"
    assert state["user_switched"] is False
    assert "vault://" in state["secret_refs"]["api_server_key"]


def test_user_switch_does_not_reuse_previous_policy() -> None:
    state = resolve_desired_state("lab-minion-02", user_id="user-alt")
    assert state["user_id"] == "user-alt"
    assert state["user_switched"] is True
    assert state["config_version"] == "2"
    assert state["secret_refs"]["api_server_key"] == "vault://lab/user-alt/api-server-key"


def test_ext_pillar_fixture(monkeypatch) -> None:
    monkeypatch.delenv("SMC_MOCK_BACKEND_URL", raising=False)
    pillar = smc_external.ext_pillar("lab-minion-01", {})
    assert pillar["smc"]["endpoint_id"] == "lab-minion-01"
    assert pillar["smc_pillar_source"] == "mock_fixture"


def test_redact_secrets() -> None:
    payload = redact_mapping({"api_key": "secret-value", "port": 8642})
    assert payload["api_key"] == "***"
    assert payload["port"] == 8642
