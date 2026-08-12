"""Beacon: emit Hermes Gateway health for Salt event bus."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_MOD_PARENT = Path(__file__).resolve().parents[1]
if str(_MOD_PARENT) not in sys.path:
    sys.path.insert(0, str(_MOD_PARENT))

from _modules import smc_hermes

__virtualname__ = "smc_hermes_health"


def __virtual__():
    return __virtualname__


def validate(config: Any) -> tuple[bool, str]:
    if isinstance(config, list):
        return True, "Valid beacon configuration"
    if isinstance(config, dict):
        return True, "Valid beacon configuration"
    return False, "Configuration for smc_hermes_health beacon must be a list or dict"


def beacon(config: Any) -> list[dict[str, Any]]:
    interval_cfg = {}
    if isinstance(config, dict):
        interval_cfg = config
    elif isinstance(config, list) and config and isinstance(config[0], dict):
        interval_cfg = config[0]
    home = interval_cfg.get("hermes_home")
    health = smc_hermes.health(hermes_home=home)
    return [{"tag": "smc/hermes/health", "hermes": health}]
