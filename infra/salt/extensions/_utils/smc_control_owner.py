"""Salt __utils__ name: smc_control_owner.* — Gateway control-owner mutex.

Standalone Salt loader plugin. No relative imports, no _utils package.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Literal

ControlOwner = Literal["salt", "runtime"]


def default_control_owner_path() -> Path:
    override = os.environ.get("SMC_CONTROL_OWNER_PATH", "").strip()
    if override:
        return Path(override)
    if sys.platform == "win32":
        program_data = os.environ.get("ProgramData", r"C:\ProgramData")
        return Path(program_data) / "SMC" / "control-owner.json"
    return Path("/etc/smc/control-owner.json")


def read_control_owner(path: Path | None = None) -> ControlOwner | None:
    target = path or default_control_owner_path()
    if not target.is_file():
        env = os.environ.get("SMC_HERMES_CONTROL_OWNER", "").strip().lower()
        if env in {"salt", "runtime"}:
            return env  # type: ignore[return-value]
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    owner = str(payload.get("hermes", "")).strip().lower()
    if owner in {"salt", "runtime"}:
        return owner  # type: ignore[return-value]
    return None


def write_control_owner(owner: ControlOwner, path: Path | None = None) -> Path:
    if owner not in {"salt", "runtime"}:
        raise ValueError(f"invalid control owner: {owner}")
    target = path or default_control_owner_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"hermes": owner}, indent=2) + "\n", encoding="utf-8")
    return target


def claim_salt_owner(path: Path | None = None) -> dict[str, Any]:
    target = path or default_control_owner_path()
    current = read_control_owner(target)
    if current == "runtime":
        return {
            "ok": False,
            "owner": current,
            "error": "control_owner_conflict",
            "message": "Runtime currently owns Hermes Gateway; refuse Salt claim",
            "path": str(target),
        }
    write_control_owner("salt", target)
    return {"ok": True, "owner": "salt", "path": str(target)}


def assert_salt_may_manage(path: Path | None = None) -> None:
    owner = read_control_owner(path)
    if owner == "runtime":
        raise RuntimeError("control_owner is runtime; Salt must not manage Gateway")
