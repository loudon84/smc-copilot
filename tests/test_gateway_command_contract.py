"""Gateway CLI contract tests (v1.3.1 FR-03)."""

from __future__ import annotations

from core.config import Settings
from integrations.hermes.cli_adapter import HermesCliAdapter


def test_gateway_command_default_profile() -> None:
    adapter = HermesCliAdapter(Settings(), executable=None)
    adapter.set_executable(__import__("pathlib").Path("hermes.exe"))
    cmd = adapter.gateway_command(profile_name="default", port=8642)
    assert cmd == ["hermes.exe", "gateway", "run", "--external-supervisor"]
    assert "--profile" not in cmd
    assert "--port" not in cmd


def test_gateway_command_named_profile() -> None:
    adapter = HermesCliAdapter(Settings())
    adapter.set_executable(__import__("pathlib").Path("C:/tools/hermes.exe"))
    cmd = adapter.gateway_command(profile_name="coding", port=8643)
    assert cmd[0].endswith("hermes.exe")
    assert cmd[1:] == ["-p", "coding", "gateway", "run", "--external-supervisor"]
    assert "--profile" not in cmd
    assert "--port" not in cmd


def test_doctor_args_have_no_json() -> None:
    adapter = HermesCliAdapter(Settings())
    # build via run_profile path
    cmd = adapter.build_profile_command(None, "doctor")
    assert cmd[-1] == "doctor"
    assert "--json" not in cmd


def test_config_check_named_profile() -> None:
    adapter = HermesCliAdapter(Settings())
    cmd = adapter.build_profile_command("team", "config", "check")
    assert cmd == ["hermes", "-p", "team", "config", "check"]
