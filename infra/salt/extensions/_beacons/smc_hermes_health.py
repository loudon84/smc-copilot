"""Beacon: emit Hermes Gateway health for Salt event bus. Uses __salt__, not _modules import."""

from __future__ import annotations

from typing import Any

__virtualname__ = "smc_hermes_health"


def __virtual__():
    return __virtualname__


def _salt() -> dict[str, Any]:
    return globals().get("__salt__") or {}


def _health(hermes_home: str | None) -> dict[str, Any]:
    salt = _salt()
    if "smc_hermes.health" in salt:
        return salt["smc_hermes.health"](hermes_home=hermes_home)
    from _modules import smc_hermes

    return smc_hermes.health(hermes_home=hermes_home)


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
    health = _health(home)
    return [{"tag": "smc/hermes/health", "hermes": health}]
