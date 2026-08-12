"""Custom grains: endpoint + Hermes facts for Salt Master."""

from __future__ import annotations

import os
import platform
import socket
import sys
from pathlib import Path
from typing import Any

_UTILS_PARENT = Path(__file__).resolve().parents[1]
if str(_UTILS_PARENT) not in sys.path:
    sys.path.insert(0, str(_UTILS_PARENT))

from _utils.control_owner import read_control_owner
from _utils.paths import HermesLayout, default_hermes_home


def smc_endpoint() -> dict[str, Any]:
    layout = HermesLayout.from_home(default_hermes_home())
    return {
        "smc_endpoint": {
            "hostname": socket.gethostname(),
            "platform": platform.system().lower(),
            "arch": platform.machine(),
            "hermes_home": str(layout.home),
            "hermes_installed": layout.is_installed(),
            "control_owner": read_control_owner(),
            "user": os.environ.get("USERNAME") or os.environ.get("USER") or "",
        }
    }
