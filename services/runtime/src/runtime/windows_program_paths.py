from __future__ import annotations

import os
import sys
from pathlib import Path

# Legacy enterprise layout (detected for migration tools; never auto-deleted).
LEGACY_PROGRAMS_ROOT = Path(r"D:\Programs")
LEGACY_COPILOT_SERVE_DIR = LEGACY_PROGRAMS_ROOT / "copilot-serve"
LEGACY_HERMES_INSTALL_DIR = LEGACY_PROGRAMS_ROOT / "HermesAgent"

# Backward-compatible aliases (prefer explicit DEFAULT_* constants below).
WINDOWS_PROGRAMS_ROOT = LEGACY_PROGRAMS_ROOT
DEFAULT_HERMES_INSTALL_DIR: Path
DEFAULT_COPILOT_SERVE_DIR: Path


def is_windows() -> bool:
    return sys.platform == "win32"


def _localappdata() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return Path(local)
    return Path.home() / "AppData" / "Local"


def user_level_smc_root() -> Path:
    """%LOCALAPPDATA%\\Programs\\SMC"""
    return _localappdata() / "Programs" / "SMC"


def machine_level_smc_root() -> Path | None:
    """%ProgramFiles%\\SMC when ProgramFiles is set."""
    program_files = os.environ.get("ProgramFiles")
    if program_files:
        return Path(program_files) / "SMC"
    return None


DEFAULT_USER_COPILOT_RUNTIME_DIR = user_level_smc_root() / "CopilotRuntime"
DEFAULT_USER_HERMES_INSTALL_DIR = user_level_smc_root() / "HermesAgent"
DEFAULT_MACHINE_COPILOT_RUNTIME_DIR = machine_level_smc_root() / "CopilotRuntime" if machine_level_smc_root() else None
DEFAULT_MACHINE_HERMES_INSTALL_DIR = machine_level_smc_root() / "HermesAgent" if machine_level_smc_root() else None

DEFAULT_HERMES_INSTALL_DIR = DEFAULT_USER_HERMES_INSTALL_DIR
DEFAULT_COPILOT_SERVE_DIR = DEFAULT_USER_COPILOT_RUNTIME_DIR


def default_hermes_install_dir() -> Path | None:
    """Windows default Hermes version install root; None on other platforms."""
    if is_windows():
        return DEFAULT_USER_HERMES_INSTALL_DIR
    return None


def default_copilot_runtime_dir() -> Path | None:
    """Windows default Copilot Runtime program root; None on other platforms."""
    if is_windows():
        return DEFAULT_USER_COPILOT_RUNTIME_DIR
    return None


def allowed_install_roots() -> list[Path]:
    """Approved Windows install roots: user SMC, optional machine SMC, legacy D:\\Programs."""
    roots: list[Path] = [user_level_smc_root()]
    machine = machine_level_smc_root()
    if machine is not None:
        roots.append(machine)
    roots.append(LEGACY_PROGRAMS_ROOT)
    return roots


def is_under_programs_root(path: Path) -> bool:
    """Return True when path is under an approved install root (incl. legacy D:\\Programs)."""
    try:
        resolved = path.expanduser().resolve()
        for root in allowed_install_roots():
            root_res = root.expanduser().resolve()
            if resolved == root_res or root_res in resolved.parents:
                return True
        return False
    except OSError:
        return False


def detect_legacy_install_paths() -> dict[str, Path]:
    """Detect legacy D:\\Programs layouts for migration tooling (no auto-delete)."""
    found: dict[str, Path] = {}
    if LEGACY_COPILOT_SERVE_DIR.exists():
        found["copilot_serve"] = LEGACY_COPILOT_SERVE_DIR
    if LEGACY_HERMES_INSTALL_DIR.exists():
        found["hermes_agent"] = LEGACY_HERMES_INSTALL_DIR
    return found


def require_under_programs_root(path: Path, *, label: str) -> Path:
    """Validate path is under an approved install root; relaxed vs v1.3 D:\\Programs-only rule."""
    from core.runtime_errors import RuntimeServiceError

    resolved = path.expanduser().resolve()
    if not is_under_programs_root(resolved):
        roots = ", ".join(str(r) for r in allowed_install_roots())
        raise RuntimeServiceError(
            f"{label} must be under an approved install root ({roots}), current: {resolved}",
            code="validation_error",
            details={"path": str(resolved), "allowedRoots": [str(r) for r in allowed_install_roots()]},
        )
    return resolved
