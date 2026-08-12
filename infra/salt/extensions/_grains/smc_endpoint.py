"""Custom grains: device facts only. Current user is NOT SOT (comes from Pillar binding)."""

from __future__ import annotations

import os
import platform
import socket
from pathlib import Path
from typing import Any


def _utils() -> dict[str, Any]:
    return globals().get("__utils__") or {}


def _read_owner():
    utils = _utils()
    if "smc_control_owner.read_control_owner" in utils:
        return utils["smc_control_owner.read_control_owner"]()
    from _utils.smc_control_owner import read_control_owner

    return read_control_owner()


def _layout(home: Path):
    utils = _utils()
    if "smc_paths.layout" in utils:
        return utils["smc_paths.layout"](str(home))
    from _utils.smc_paths import layout

    return layout(str(home))


def smc_endpoint() -> dict[str, Any]:
    home_env = os.environ.get("HERMES_HOME", "").strip()
    layout = _layout(Path(home_env)) if home_env else None
    return {
        "smc_endpoint": {
            "hostname": socket.gethostname(),
            "platform": platform.system().lower(),
            "arch": platform.machine(),
            "hermes_home": str(layout.home) if layout else "",
            "hermes_installed": layout.is_installed() if layout else False,
            "control_owner": _read_owner(),
        }
    }
