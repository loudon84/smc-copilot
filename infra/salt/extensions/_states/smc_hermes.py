"""Salt state module wrapping smc_hermes execution functions."""

from __future__ import annotations

from typing import Any

__virtualname__ = "smc_hermes"


def __virtual__():
    return __virtualname__


def _salt():
    return globals().get("__salt__", {})


def _opts():
    return globals().get("__opts__", {})


def installed(
    name: str,
    version: str = "latest",
    artifact_path: str | None = None,
    hermes_home: str | None = None,
) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = f"Hermes {version} would be installed"
        return ret
    result = _salt()["smc_hermes.install"](
        version=version,
        artifact_path=artifact_path,
        hermes_home=hermes_home,
    )
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = result.get("message") or ("installed" if ret["result"] else result.get("error", "failed"))
    return ret


def gateway_running(name: str, hermes_home: str | None = None) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = "Gateway health would be checked / restarted"
        return ret
    health = _salt()["smc_hermes.health"](hermes_home=hermes_home)
    if health.get("gateway_healthy"):
        ret["result"] = True
        ret["comment"] = "Gateway healthy"
        return ret
    restart = _salt()["smc_hermes.restart"](hermes_home=hermes_home)
    ret["result"] = bool(restart.get("ok"))
    ret["changes"] = {"restart": restart}
    ret["comment"] = "restarted" if ret["result"] else restart.get("message", "restart failed")
    return ret
