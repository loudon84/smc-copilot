"""Atomic control-owner handover — migrate/remigrate/rollback (v2.4)."""

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


def _hooks():
    utils = _utils()
    if "smc_handover_hooks.build_hooks" in utils:
        return utils["smc_handover_hooks.build_hooks"]()
    from _utils.smc_handover_hooks import build_hooks

    return build_hooks()


def read_owner() -> str | None:
    return _call_util("smc_control_owner.read_control_owner", _owner_path())


def commit(desired_owner: str = "salt", *, require_health: bool = True) -> dict[str, Any]:
    """Atomically switch control owner. Only path that should write owner=salt."""
    if desired_owner != "salt":
        return {"ok": False, "error": "desired_owner_must_be_salt"}
    current = read_owner()
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
        if path.is_file():
            path.unlink()
        return {"ok": True, "owner": None, "restored": "absent"}
    if owner not in {"salt", "runtime", "direct"}:
        return {"ok": False, "error": "invalid_previous_owner", "owner": owner}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"hermes": owner}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "owner": owner, "restored": True}


def _run_client(operation: str, **kwargs: Any) -> dict[str, Any]:
    program_data = Path(os.environ.get("ProgramData", r"C:\ProgramData"))
    # Prefer utils-local orchestrator so Minion does not need the client package.
    if operation == "migrate":
        return _call_util(
            "smc_handover_hooks.run_migrate",
            program_data=program_data,
            endpoint_id=kwargs.get("endpoint_id", "ep_lab"),
        )
    if operation == "remigrate":
        return _call_util(
            "smc_handover_hooks.run_remigrate",
            program_data=program_data,
            endpoint_id=kwargs.get("endpoint_id", "ep_lab"),
            idempotency_key=kwargs.get("idempotency_key"),
        )
    return _call_util("smc_handover_hooks.run_rollback", program_data=program_data)


def migrate(
    endpoint_id: str = "ep_lab",
    release_id: str | None = None,
    config_revision: str | None = None,
) -> dict[str, Any]:
    """Full Runtime → Salt handover. commit() remains the atomic owner primitive only."""
    out = _run_client("migrate", endpoint_id=endpoint_id, release_id=release_id, config_revision=config_revision)
    if not out.get("ok") and read_owner() == "salt":
        out["auto_rollback"] = rollback()
    return out


def remigrate(endpoint_id: str = "ep_lab", idempotency_key: str | None = None) -> dict[str, Any]:
    out = _run_client("remigrate", endpoint_id=endpoint_id, idempotency_key=idempotency_key)
    if not out.get("ok") and read_owner() == "salt":
        out["auto_rollback"] = rollback()
    return out
