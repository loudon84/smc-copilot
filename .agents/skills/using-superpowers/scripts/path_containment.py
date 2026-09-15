#!/usr/bin/env python3
"""Deprecated shim — re-exports canonical path_containment."""
from __future__ import annotations

import sys
from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "smc-work-router" / "scripts"
if str(_CANONICAL) not in sys.path:
    sys.path.insert(0, str(_CANONICAL))

from path_containment import *  # noqa: E402,F403
