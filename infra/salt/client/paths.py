"""Machine-scope SMC + Salt Minion paths (Windows ProgramData; POSIX fallbacks for tests)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def program_data() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("ProgramData", r"C:\ProgramData"))
    override = os.environ.get("SMC_PROGRAM_DATA", "").strip()
    if override:
        return Path(override)
    return Path("/var/lib/smc-programdata")


def smc_root(base: Path | None = None) -> Path:
    return (base or program_data()) / "SMC"


def endpoint_id_path(base: Path | None = None) -> Path:
    return smc_root(base) / "endpoint-id"


def control_owner_path(base: Path | None = None) -> Path:
    override = os.environ.get("SMC_CONTROL_OWNER_PATH", "").strip()
    if override:
        return Path(override)
    return smc_root(base) / "control-owner.json"


def migration_marker_path(base: Path | None = None) -> Path:
    return smc_root(base) / "migration-complete.json"


def gateway_wrapper_dir(base: Path | None = None) -> Path:
    return smc_root(base) / "bin"


def salt_minion_conf_dir() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Salt Project" / "Salt" / "conf" / "minion.d"
    override = os.environ.get("SMC_SALT_MINION_D", "").strip()
    if override:
        return Path(override)
    return Path("/etc/salt/minion.d")


def write_endpoint_id(endpoint_id: str, base: Path | None = None) -> Path:
    path = endpoint_id_path(base)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(endpoint_id.strip() + "\n", encoding="utf-8")
    return path


def read_endpoint_id(base: Path | None = None) -> str | None:
    path = endpoint_id_path(base)
    if not path.is_file():
        return None
    value = path.read_text(encoding="utf-8").strip()
    return value or None
