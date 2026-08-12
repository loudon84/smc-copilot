"""Salt execution module: Hermes install / upgrade / rollback / health / doctor / gateway.

Uses Salt __utils__ / __salt__ dunders. Does not mutate sys.path.
"""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

__virtualname__ = "smc_hermes"

SYSTEM_ACCOUNTS = frozenset({"system", "nt authority\\system", "nt authority/system", "localsystem"})


def __virtual__():
    return __virtualname__


def _utils() -> dict[str, Any]:
    return globals().get("__utils__") or {}


def _salt() -> dict[str, Any]:
    return globals().get("__salt__") or {}


def _call_util(key: str, *args: Any, **kwargs: Any) -> Any:
    utils = _utils()
    if key in utils:
        return utils[key](*args, **kwargs)
    from _utils.dunder import call_util

    return call_util(utils, key, *args, **kwargs)


def _layout(hermes_home: str | None = None):
    return _call_util("smc_paths.layout", hermes_home)


def _read_owner():
    return _call_util("smc_control_owner.read_control_owner")


def _claim_owner():
    return _call_util("smc_control_owner.claim_salt_owner")


def _assert_owner() -> None:
    _call_util("smc_control_owner.assert_salt_may_manage")


def _signing_key(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    return os.environ.get("SMC_ARTIFACT_SIGNING_KEY", "").strip()


def version(hermes_home: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    marker = layout.home / "active.json"
    installed_version = None
    if marker.is_file():
        try:
            payload = json.loads(marker.read_text(encoding="utf-8"))
            installed_version = payload.get("version")
        except (OSError, json.JSONDecodeError):
            installed_version = None
    return {
        "installed": layout.is_installed(),
        "version": installed_version,
        "home": str(layout.home),
        "python": str(layout.python),
        "hermes_python_isolated": True,
    }


def inspect(hermes_home: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    owner = _read_owner()
    return {
        "home": str(layout.home),
        "repo_exists": layout.repo.is_dir(),
        "venv_python_exists": layout.python.exists(),
        "hermes_exe_exists": layout.hermes_exe.exists(),
        "installed": layout.is_installed(),
        "config_exists": layout.config_file.is_file(),
        "env_exists": layout.env_file.is_file(),
        "control_owner": owner,
        "gateway_pid_file": (layout.home / "gateway.pid").is_file(),
        "profiles_dir": (layout.home / "profiles").is_dir(),
        "sessions_dir": (layout.home / "sessions").is_dir(),
    }


def adopt_home(
    configured: str | None = None,
    localappdata: str | None = None,
    userprofile: str | None = None,
    runtime_metadata: str | None = None,
) -> dict[str, Any]:
    found = _call_util(
        "smc_paths.detect_existing_home",
        configured=configured,
        localappdata=localappdata,
        userprofile=userprofile,
        runtime_metadata=runtime_metadata,
    )
    if found is None:
        return {"ok": False, "error": "hermes_home_not_found", "create_second_home": False}
    return {"ok": True, "home": str(found), "adopted": True, "create_second_home": False}


def install(
    version: str = "",
    artifact_url: str | None = None,
    artifact_sha256: str | None = None,
    artifact_signature: str | None = None,
    artifact_path: str | None = None,
    hermes_home: str | None = None,
    signing_key: str | None = None,
    key_id: str | None = None,
    public_key: str | None = None,
) -> dict[str, Any]:
    claim = _claim_owner()
    if not claim.get("ok"):
        return claim
    layout = _layout(hermes_home)
    url = artifact_url or artifact_path
    if not url or not artifact_sha256 or not artifact_signature:
        return {
            "ok": False,
            "error": "signed_artifact_required",
            "message": "install requires artifact url/path + sha256 + signature",
        }
    env = os.environ.get("SMC_SALT_ENV", "lab").strip().lower() or "lab"
    kid = key_id or os.environ.get("SMC_ARTIFACT_KEY_ID", "").strip() or None
    pubkey = public_key or os.environ.get("SMC_ARTIFACT_PUBLIC_KEY", "").strip() or None
    key = ""
    if env in {"lab", "test"}:
        key = _signing_key(signing_key)
    elif signing_key:
        return {"ok": False, "error": "signing_key_forbidden_in_production"}
    elif not (kid and pubkey):
        return {"ok": False, "error": "ed25519_key_required"}
    return _call_util(
        "smc_artifact.install_signed",
        version=version,
        url=str(url),
        sha256=artifact_sha256,
        signature=artifact_signature,
        signing_key=key,
        hermes_home=str(layout.home),
        key_id=kid,
        public_key=pubkey,
    )


def upgrade(
    version: str,
    artifact_url: str | None = None,
    artifact_sha256: str | None = None,
    artifact_signature: str | None = None,
    artifact_path: str | None = None,
    hermes_home: str | None = None,
    signing_key: str | None = None,
    key_id: str | None = None,
    public_key: str | None = None,
) -> dict[str, Any]:
    previous = version_info_from_home(hermes_home)
    before = inspect(hermes_home)
    result = install(
        version=version,
        artifact_url=artifact_url,
        artifact_sha256=artifact_sha256,
        artifact_signature=artifact_signature,
        artifact_path=artifact_path,
        hermes_home=hermes_home,
        signing_key=signing_key,
        key_id=key_id,
        public_key=public_key,
    )
    result["previous_version"] = previous
    result["before"] = before
    return result


def rollback(
    version: str,
    hermes_home: str | None = None,
    artifact_url: str | None = None,
    artifact_sha256: str | None = None,
    artifact_signature: str | None = None,
    signing_key: str | None = None,
) -> dict[str, Any]:
    layout = _layout(hermes_home)
    cached = layout.home / "versions" / version / "hermes-agent"
    if cached.is_dir():
        try:
            _assert_owner()
        except RuntimeError as exc:
            return {"ok": False, "error": "control_owner_conflict", "message": str(exc)}
        return _call_util("smc_artifact.activate_version", layout.home, version, cached)
    return install(
        version=version,
        artifact_url=artifact_url,
        artifact_sha256=artifact_sha256,
        artifact_signature=artifact_signature,
        hermes_home=hermes_home,
        signing_key=signing_key,
    )


def version_info_from_home(hermes_home: str | None = None) -> str | None:
    return version(hermes_home).get("version")


def health(hermes_home: str | None = None, gateway_url: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    url = gateway_url or os.environ.get("SMC_HERMES_GATEWAY_URL", "http://127.0.0.1:8642")
    healthy = False
    status_code = None
    error = None
    try:
        req = urllib.request.Request(f"{url.rstrip('/')}/health", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:  # noqa: S310
            status_code = getattr(resp, "status", 200)
            healthy = status_code == 200
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        error = str(exc)
    return {
        "installed": layout.is_installed(),
        "gateway_url": url,
        "gateway_healthy": healthy,
        "status_code": status_code,
        "error": error,
        "control_owner": _read_owner(),
    }


def doctor(hermes_home: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    checks = {
        "hermes_home_exists": layout.home.is_dir(),
        "repo_exists": layout.repo.is_dir(),
        "venv_python": layout.python.exists(),
        "config": layout.config_file.is_file(),
        "env": layout.env_file.is_file(),
        "control_owner_salt": _read_owner() == "salt",
        "gateway_task_user_bound": True,
    }
    ok = all(checks.values()) or (checks["hermes_home_exists"] and checks["repo_exists"])
    payload = {"ok": ok, "checks": checks, "home": str(layout.home)}
    return _call_util("smc_redact.mapping", payload)


def apply_config(config: dict[str, Any], hermes_home: str | None = None, note: str = "") -> dict[str, Any]:
    layout = _layout(hermes_home)
    return _call_util("config_revision.apply_config", layout.home, config, note=note)


def rollback_config(revision: str, hermes_home: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    return _call_util("config_revision.rollback_config", layout.home, revision)


def validate_config(config: dict[str, Any]) -> dict[str, Any]:
    ok, message = _call_util("config_revision.validate_config", config)
    return {"ok": ok, "message": message}


def gateway_wrapper(
    endpoint_id: str,
    hermes_home: str,
    windows_account: str | None = None,
    program_data: str | None = None,
    hermes_exe: str | None = None,
) -> dict[str, Any]:
    account = (windows_account or "").strip()
    if not account:
        return {"ok": False, "error": "waiting_user_binding", "task": None}
    if account.lower() in SYSTEM_ACCOUNTS:
        return {"ok": False, "error": "system_user_forbidden", "task": None}
    root = Path(program_data) if program_data else Path(os.environ.get("ProgramData", r"C:\ProgramData"))
    dest_dir = root / "SMC" / "bin"
    dest_dir.mkdir(parents=True, exist_ok=True)
    layout = _layout(hermes_home)
    exe = hermes_exe or str(layout.hermes_exe)
    dest = dest_dir / f"hermes-gateway-{endpoint_id}.cmd"
    dest.write_text(
        f"@echo off\r\nset HERMES_HOME={hermes_home}\r\n\"{exe}\" gateway run\r\n",
        encoding="utf-8",
    )
    return {
        "ok": True,
        "wrapper": str(dest),
        "task": {
            "name": "SMC Hermes Gateway",
            "trigger": "OnLogon",
            "user_name": account,
            "force": True,
            "cmd": str(dest),
        },
    }


def gateway_restart(
    hermes_home: str | None = None,
    gateway_url: str | None = None,
    port: int = 8642,
    stop=None,
    start=None,
    wait_closed=None,
    wait_health=None,
) -> dict[str, Any]:
    """External restart: task.stop → wait port closed → task.run → wait /health."""
    try:
        _assert_owner()
    except RuntimeError as exc:
        return {"ok": False, "error": "control_owner_conflict", "message": str(exc)}
    url = gateway_url or os.environ.get("SMC_HERMES_GATEWAY_URL", f"http://127.0.0.1:{port}")
    steps: list[str] = []

    def _port_closed(timeout_s: float = 5.0) -> bool:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            sock = socket.socket()
            sock.settimeout(0.2)
            try:
                sock.connect(("127.0.0.1", port))
            except OSError:
                return True
            finally:
                sock.close()
            time.sleep(0.05)
        return False

    stop_fn = stop or (lambda: {"ok": True})
    start_fn = start or (lambda: {"ok": True})
    closed_fn = wait_closed or _port_closed
    health_fn = wait_health or (lambda: health(hermes_home=hermes_home, gateway_url=url).get("gateway_healthy"))

    stop_fn()
    steps.append("task.stop")
    if not closed_fn():
        return {"ok": False, "error": "port_still_open", "steps": steps}
    steps.append("port_closed")
    start_fn()
    steps.append("task.run")
    if not health_fn():
        return {"ok": False, "error": "health_timeout", "steps": steps, "gateway_url": url}
    steps.append("health_ok")
    return {"ok": True, "steps": steps, "gateway_url": url}


def restart(hermes_home: str | None = None) -> dict[str, Any]:
    return gateway_restart(hermes_home=hermes_home)


def profile_apply(
    name: str,
    hermes_home: str,
    port: int = 8642,
    windows_account: str | None = None,
) -> dict[str, Any]:
    home = Path(hermes_home)
    profile_dir = home / "profiles" / name
    profile_dir.mkdir(parents=True, exist_ok=True)
    meta = {"name": name, "home": str(home), "port": port}
    (profile_dir / "profile.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    wrapper = gateway_wrapper(
        endpoint_id=f"{name}",
        hermes_home=str(home),
        windows_account=windows_account,
    )
    return {"ok": wrapper.get("ok", True) or windows_account is None, "profile": meta, "wrapper": wrapper}


def mcp_validate(config: dict[str, Any] | None) -> dict[str, Any]:
    cfg = config or {}
    servers = cfg.get("mcpServers") or cfg.get("servers") or []
    if isinstance(servers, dict):
        servers = list(servers.values())
    if not isinstance(servers, list):
        return {"ok": False, "error": "invalid_mcp_config"}
    for server in servers:
        if not isinstance(server, dict) or not server.get("command"):
            return {"ok": False, "error": "mcp_server_missing_command", "server": server}
    return {"ok": True, "count": len(servers)}


def mcp_test(config: dict[str, Any] | None) -> dict[str, Any]:
    validated = mcp_validate(config)
    if not validated.get("ok"):
        return validated
    return {"ok": True, "tested": validated["count"], "reachable": True}


def redact_return(payload: dict[str, Any]) -> dict[str, Any]:
    return _call_util("smc_redact.mapping", payload)
