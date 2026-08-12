"""Salt execution module: Hermes install / upgrade / rollback / health / doctor.

Salt dunders (__salt__, __opts__) are optional so pytest can import this file.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_UTILS_ROOT = Path(__file__).resolve().parents[1] / "_utils"
if str(_UTILS_ROOT) not in sys.path:
    sys.path.insert(0, str(_UTILS_ROOT.parent))

from _utils.control_owner import assert_salt_may_manage, claim_salt_owner, read_control_owner
from _utils.paths import HermesLayout, default_hermes_home
from _utils.redact import redact_mapping
from _utils.semver import semver_key

__virtualname__ = "smc_hermes"


def __virtual__():
    return __virtualname__


def _layout(hermes_home: str | None = None) -> HermesLayout:
    home = Path(hermes_home).expanduser() if hermes_home else default_hermes_home()
    return HermesLayout.from_home(home)


def version(hermes_home: str | None = None) -> dict[str, Any]:
    """Report installed Hermes version if detectable."""
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
    owner = read_control_owner()
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
    }


def install(
    version: str = "latest",
    artifact_path: str | None = None,
    hermes_home: str | None = None,
) -> dict[str, Any]:
    """Install Hermes from a local artifact directory (repo-only fixture).

    Production would download a signed bundle. Lab/mock copies a fixture tree
    into HERMES_HOME/hermes-agent and records active.json. Never uses Salt's Python.
    """
    claim = claim_salt_owner()
    if not claim.get("ok"):
        return claim
    layout = _layout(hermes_home)
    layout.home.mkdir(parents=True, exist_ok=True)
    if not artifact_path:
        return {
            "ok": False,
            "error": "artifact_required",
            "message": "repo-only install requires artifact_path (fixture tree or wheel dir)",
        }
    source = Path(artifact_path)
    if not source.exists():
        return {"ok": False, "error": "artifact_missing", "path": str(source)}
    if layout.repo.exists():
        shutil.rmtree(layout.repo)
    if source.is_dir():
        shutil.copytree(source, layout.repo)
    else:
        layout.repo.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, layout.repo / source.name)
    active = {"version": version, "channel": "lab", "python": str(layout.python)}
    (layout.home / "active.json").write_text(json.dumps(active, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "version": version, "home": str(layout.home), "installed": layout.is_installed()}


def upgrade(
    version: str,
    artifact_path: str | None = None,
    hermes_home: str | None = None,
) -> dict[str, Any]:
    current = inspect(hermes_home)
    previous = version_info_from_home(hermes_home)
    result = install(version=version, artifact_path=artifact_path, hermes_home=hermes_home)
    result["previous_version"] = previous
    result["semver_order"] = list(semver_key(version))
    result["before"] = current
    return result


def rollback(version: str, artifact_path: str | None = None, hermes_home: str | None = None) -> dict[str, Any]:
    return upgrade(version=version, artifact_path=artifact_path, hermes_home=hermes_home)


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
        with urllib.request.urlopen(req, timeout=2) as resp:
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
        "control_owner": read_control_owner(),
    }


def doctor(hermes_home: str | None = None) -> dict[str, Any]:
    layout = _layout(hermes_home)
    checks = {
        "hermes_home_exists": layout.home.is_dir(),
        "repo_exists": layout.repo.is_dir(),
        "venv_python": layout.python.exists(),
        "config": layout.config_file.is_file(),
        "env": layout.env_file.is_file(),
        "control_owner_salt": read_control_owner() == "salt",
    }
    ok = all(checks.values()) or (checks["hermes_home_exists"] and checks["repo_exists"])
    return {"ok": ok, "checks": checks, "home": str(layout.home)}


def restart(hermes_home: str | None = None) -> dict[str, Any]:
    """Request Gateway restart via hermes CLI if present; otherwise report scheduled-task owner."""
    try:
        assert_salt_may_manage()
    except RuntimeError as exc:
        return {"ok": False, "error": "control_owner_conflict", "message": str(exc)}
    layout = _layout(hermes_home)
    if not layout.python.exists():
        return {
            "ok": False,
            "error": "hermes_python_missing",
            "message": "Hermes venv missing; scheduled task / install first",
        }
    cmd = [str(layout.python), "-m", "hermes_cli.main", "gateway", "restart"]
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(layout.repo) if layout.repo.is_dir() else None,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": "restart_failed", "message": str(exc)}
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": (completed.stdout or "")[-2000:],
        "stderr": (completed.stderr or "")[-2000:],
    }


def redact_return(payload: dict[str, Any]) -> dict[str, Any]:
    return redact_mapping(payload)
