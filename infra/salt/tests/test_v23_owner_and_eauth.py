from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_hermes_sls_does_not_claim_owner_early() -> None:
    text = (ROOT / "states" / "hermes.sls").read_text(encoding="utf-8")
    assert "hermes_control_owner" not in text
    assert "control-owner.json" not in text
    assert "smc_hermes.prepared" in text or "smc_hermes.prepared" in text.replace(" ", "")
    assert "prepared" in text


def test_smc_handover_module_exists() -> None:
    assert (ROOT / "extensions" / "_modules" / "smc_handover.py").is_file()
    assert (ROOT / "extensions" / "_states" / "smc_handover.py").is_file()


def test_eauth_has_no_cmd_run() -> None:
    text = (ROOT / "master" / "master.d" / "eauth.conf").read_text(encoding="utf-8")
    # Ignore comments when scanning for forbidden functions.
    code_lines = "\n".join(line for line in text.splitlines() if not line.strip().startswith("#"))
    assert "cmd.run" not in code_lines
    assert "smc_hermes.*" in text
    assert "smc_handover.*" in text
