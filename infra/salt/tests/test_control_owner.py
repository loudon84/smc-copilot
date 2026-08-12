from __future__ import annotations

from pathlib import Path

from _utils.control_owner import claim_salt_owner, read_control_owner, write_control_owner


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
