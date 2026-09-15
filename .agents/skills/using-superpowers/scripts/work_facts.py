#!/usr/bin/env python3
"""Deprecated shim — re-exports canonical smc-work-router.work_facts."""
from __future__ import annotations

import sys
from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "smc-work-router" / "scripts"
if str(_CANONICAL) not in sys.path:
    sys.path.insert(0, str(_CANONICAL))

from work_facts import *  # noqa: E402,F403
from work_facts import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
