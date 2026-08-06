from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("smc-copilot-serve")
except PackageNotFoundError:
    __version__ = "1.6.0"
