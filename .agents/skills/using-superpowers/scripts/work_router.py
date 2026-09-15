#!/usr/bin/env python3
"""Deprecated shim — re-exports canonical smc-work-router.work_router with zero duplicated logic."""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "smc-work-router" / "scripts"
if str(_CANONICAL) not in sys.path:
    sys.path.insert(0, str(_CANONICAL))

warnings.warn(
    "using-superpowers is deprecated; use smc-work-router (canonical Work Router)",
    DeprecationWarning,
    stacklevel=2,
)
print(
    "DEPRECATED: using-superpowers → smc-work-router (canonical Work Router)",
    file=sys.stderr,
)

from work_router import *  # noqa: E402,F403
from work_router import main, route, route_bound, REQUIRED, RISKS  # noqa: E402

if __name__ == "__main__":
    main()
