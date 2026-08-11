"""Windows subprocess helpers — hide console windows for Hermes CLI/Gateway.

Hermes console shims (``hermes.exe``) flash a CMD window unless
``CREATE_NO_WINDOW`` (+ STARTF_USESHOWWINDOW/SW_HIDE) is set. Shared by
CLI adapter probes and GatewayProcessManager so ``npm run dev:runtime``
never pops a terminal for status checks or ``hermes gateway run``.
"""

from __future__ import annotations

import subprocess
import sys
from typing import Any


def windows_no_window_kwargs() -> dict[str, Any]:
    """Return kwargs for subprocess / asyncio.create_subprocess_exec.

    No-op on non-Windows. Does not set DETACHED_PROCESS so asyncio can
    still track the child (Runtime ownership / watch tasks).
    """
    if sys.platform != "win32":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return {
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "startupinfo": startupinfo,
    }
