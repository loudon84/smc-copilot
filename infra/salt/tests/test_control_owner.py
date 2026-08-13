from __future__ import annotations

from pathlib import Path

from plugin_loader import load_named_util

_owner = load_named_util("smc_control_owner")
claim_salt_owner = _owner.claim_salt_owner
read_control_owner = _owner.read_control_owner
write_control_owner = _owner.write_control_owner


def test_claim_salt_owner(tmp_path: Path) -> None:
    path = tmp_path / "control-owner.json"
    result = claim_salt_owner(path)
    assert result["ok"] is True
    assert read_control_owner(path) == "salt"


def test_refuse_when_runtime_owns(tmp_path: Path) -> None:
    path = tmp_path / "control-owner.json"
    write_control_owner("runtime", path)
    result = claim_salt_owner(path)
    assert result["ok"] is False
    assert result["error"] == "control_owner_conflict"
    assert read_control_owner(path) == "runtime"
