"""Atomic control-owner handover — only this module may claim salt ownership."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

__virtualname__ = "smc_handover"


def __virtual__():
    return __virtualname__


def _utils() -> dict[str, Any]:
    return globals().get("__utils__") or {}


def _call_util(key: str, *args: Any, **kwargs: Any) -> Any:
    utils = _utils()
    if key in utils:
        return utils[key](*args, **kwargs)
    from _utils.dunder import call_util

    return call_util(utils, key, *args, **kwargs)


def _owner_path() -> Path:
    override = os.environ.get("SMC_CONTROL_OWNER_PATH", "").strip()
    if override:
        return Path(override)
    program_data = os.environ.get("ProgramData", r"C:\ProgramData")
    return Path(program_data) / "SMC" / "control-owner.json"


def read_owner() -> str | None:
    return _call_util("smc_control_owner.read_control_owner", _owner_path())


def commit(desired_owner: str = "salt", *, require_health: bool = True) -> dict[str, Any]:
    """Atomically switch control owner. Only path that should write owner=salt."""
    if desired_owner != "salt":
        return {"ok": False, "error": "desired_owner_must_be_salt"}
    current = read_owner()
    if current == "runtime":
        # Still allow explicit handover after runtime paused by migrate hooks.
        pass
    claim = _call_util("smc_control_owner.claim_salt_owner", _owner_path())
    if not claim.get("ok"):
        return claim
    return {"ok": True, "owner": "salt", "previous": current, "path": str(_owner_path())}


def rollback(previous_owner: str | None = None) -> dict[str, Any]:
    """Restore prior owner from argument or snapshot; never force 'runtime' blindly."""
    path = _owner_path()
    snapshot_path = path.parent / "handover-snapshots" / "latest.json"
    owner = previous_owner
    if owner is None and snapshot_path.is_file():
        try:
            payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
            owner = payload.get("owner")
        except (OSError, json.JSONDecodeError):
            owner = None
    if owner in {None, ""}:
        # No prior owner file — remove salt claim rather than inventing runtime.
        if path.is_file():
            path.unlink()
        return {"ok": True, "owner": None, "restored": "absent"}
    if owner not in {"salt", "runtime", "direct"}:
        return {"ok": False, "error": "invalid_previous_owner", "owner": owner}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"hermes": owner}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "owner": owner, "restored": True}
