"""Salt state module wrapping smc_hermes execution functions via __salt__."""

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
    version: str = "",
    artifact_url: str | None = None,
    artifact_sha256: str | None = None,
    artifact_signature: str | None = None,
    artifact_path: str | None = None,
    hermes_home: str | None = None,
    migrate_mode: bool = False,
) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = f"Hermes {version} would be installed"
        return ret
    result = _salt()["smc_hermes.install"](
        version=version,
        artifact_url=artifact_url,
        artifact_sha256=artifact_sha256,
        artifact_signature=artifact_signature,
        artifact_path=artifact_path,
        hermes_home=hermes_home,
        migrate_mode=migrate_mode,
    )
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = result.get("message") or ("installed" if ret["result"] else result.get("error", "failed"))
    return ret


def prepared(
    name: str,
    version: str = "",
    artifact_url: str | None = None,
    artifact_sha256: str | None = None,
    artifact_signature: str | None = None,
    artifact_path: str | None = None,
    hermes_home: str | None = None,
    migrate_mode: bool = True,
) -> dict[str, Any]:
    """Prepare Hermes without claiming control-owner."""
    return installed(
        name=name,
        version=version,
        artifact_url=artifact_url,
        artifact_sha256=artifact_sha256,
        artifact_signature=artifact_signature,
        artifact_path=artifact_path,
        hermes_home=hermes_home,
        migrate_mode=True if migrate_mode is None else bool(migrate_mode),
    )

def gateway_started(name: str, hermes_home: str | None = None) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = "Gateway would be started"
        return ret
    result = _salt()["smc_hermes.gateway_start"](hermes_home=hermes_home)
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "started" if ret["result"] else result.get("error", "start failed")
    return ret


def gateway_stopped(name: str, hermes_home: str | None = None) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    if _opts().get("test"):
        ret["result"] = None
        ret["comment"] = "Gateway would be stopped"
        return ret
    result = _salt()["smc_hermes.gateway_stop"](hermes_home=hermes_home)
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "stopped" if ret["result"] else result.get("error", "stop failed")
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
    restart = _salt()["smc_hermes.gateway_restart"](hermes_home=hermes_home)
    ret["result"] = bool(restart.get("ok"))
    ret["changes"] = {"restart": restart}
    ret["comment"] = "restarted" if ret["result"] else restart.get("message", "restart failed")
    return ret


def gateway_wrapper_present(
    name: str,
    endpoint_id: str,
    hermes_home: str,
    windows_account: str | None = None,
    program_data: str | None = None,
) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    result = _salt()["smc_hermes.gateway_wrapper"](
        endpoint_id=endpoint_id,
        hermes_home=hermes_home,
        windows_account=windows_account,
        program_data=program_data,
    )
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "wrapper ready" if ret["result"] else result.get("error", "failed")
    return ret


def profile_present(
    name: str,
    hermes_home: str,
    port: int = 8642,
    windows_account: str | None = None,
) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    result = _salt()["smc_hermes.profile_apply"](
        name=name,
        hermes_home=hermes_home,
        port=port,
        windows_account=windows_account,
    )
    ret["result"] = bool(result.get("ok"))
    ret["changes"] = result if ret["result"] else {}
    ret["comment"] = "profile applied" if ret["result"] else result.get("error", "failed")
    return ret


def mcp_configured(name: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    ret: dict[str, Any] = {"name": name, "changes": {}, "result": False, "comment": ""}
    validated = _salt()["smc_hermes.mcp_validate"](config=config)
    if not validated.get("ok"):
        ret["comment"] = validated.get("error", "invalid mcp")
        return ret
    tested = _salt()["smc_hermes.mcp_test"](config=config)
    ret["result"] = bool(tested.get("ok"))
    ret["changes"] = {"mcp": tested}
    ret["comment"] = "mcp configured" if ret["result"] else tested.get("error", "mcp test failed")
    return ret
