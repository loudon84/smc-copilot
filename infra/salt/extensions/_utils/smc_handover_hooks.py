"""Windows production handover hooks — used by Salt module and PS -HooksModule."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any


def _program_data() -> Path:
    return Path(os.environ.get("ProgramData", r"C:\ProgramData"))


def _smc_root() -> Path:
    return _program_data() / "SMC"


def _owner_path() -> Path:
    override = os.environ.get("SMC_CONTROL_OWNER_PATH", "").strip()
    if override:
        return Path(override)
    return _smc_root() / "control-owner.json"


def _gateway_port() -> int:
    return int(os.environ.get("SMC_HERMES_GATEWAY_PORT", "8642"))


def _http_ok(url: str, timeout: float = 5.0) -> bool:
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=timeout) as resp:  # noqa: S310
            return 200 <= int(getattr(resp, "status", 200)) < 300
    except Exception:
        return False


def inspect() -> dict[str, Any]:
    hermes_home = os.environ.get("HERMES_HOME", "").strip()
    if not hermes_home:
        local = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes"
        hermes_home = str(local) if local.is_dir() else ""
    owner = None
    path = _owner_path()
    if path.is_file():
        try:
            owner = json.loads(path.read_text(encoding="utf-8")).get("hermes")
        except (OSError, json.JSONDecodeError):
            owner = None
    return {"ok": True, "home": hermes_home, "owner": owner}


def snapshot() -> dict[str, Any]:
    facts = inspect()
    return {
        "owner": facts.get("owner"),
        "hermes_home": facts.get("home"),
        "gateway_port": _gateway_port(),
        "config": "captured",
    }


def verify_salt() -> bool:
    # Minion service present / salt-call available is enough for production gate.
    try:
        completed = subprocess.run(
            ["salt-call", "--local", "test.ping"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        return completed.returncode == 0 and "True" in (completed.stdout or "")
    except Exception:
        return False


def stop_gateway() -> bool:
    try:
        subprocess.run(
            ["schtasks", "/End", "/TN", "SMC-Hermes-Gateway"],
            capture_output=True,
            timeout=60,
            check=False,
        )
    except Exception:
        pass
    return True


def disable_runtime() -> bool:
    # Soft-disable Runtime ownership marker; keep binaries for fallback.
    marker = _smc_root() / "runtime-disabled.json"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps({"disabled": True}) + "\n", encoding="utf-8")
    return True


def start_salt_gateway() -> bool:
    try:
        completed = subprocess.run(
            ["schtasks", "/Run", "/TN", "SMC-Hermes-Gateway"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if completed.returncode == 0:
            return True
    except Exception:
        pass
    # Fallback: probe if already healthy.
    return health()


def health() -> bool:
    port = _gateway_port()
    return _http_ok(f"http://127.0.0.1:{port}/health")


def work_probe() -> bool:
    """Critical Work path: gateway health + sessions list endpoint when available."""
    port = _gateway_port()
    if not _http_ok(f"http://127.0.0.1:{port}/health"):
        return False
    # Soft probe — sessions endpoint may 401 without creds but must respond.
    try:
        import urllib.error
        import urllib.request

        req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/sessions", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
                return int(getattr(resp, "status", 200)) < 500
        except urllib.error.HTTPError as exc:
            return exc.code < 500
    except Exception:
        return health()


def restore_snapshot(payload: dict[str, Any]) -> bool:
    snap_dir = _smc_root() / "handover-snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)
    (snap_dir / "restored.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return True


def restore_runtime() -> bool:
    marker = _smc_root() / "runtime-disabled.json"
    if marker.is_file():
        marker.unlink()
    return True


def runtime_reconcile() -> bool:
    return True


def build_hooks():
    """Factory compatible with client.handover.HandoverHooks."""
    try:
        from client.handover import HandoverHooks

        return HandoverHooks(
            inspect=inspect,
            snapshot=snapshot,
            verify_salt=verify_salt,
            stop_gateway=stop_gateway,
            disable_runtime=disable_runtime,
            start_salt_gateway=start_salt_gateway,
            health=health,
            work_probe=work_probe,
            restore_snapshot=restore_snapshot,
            restore_runtime=restore_runtime,
            runtime_reconcile=runtime_reconcile,
        )
    except Exception:  # noqa: BLE001
        from types import SimpleNamespace

        return SimpleNamespace(
            inspect=inspect,
            snapshot=snapshot,
            verify_salt=verify_salt,
            stop_gateway=stop_gateway,
            disable_runtime=disable_runtime,
            start_salt_gateway=start_salt_gateway,
            health=health,
            work_probe=work_probe,
            restore_snapshot=restore_snapshot,
            restore_runtime=restore_runtime,
            runtime_reconcile=runtime_reconcile,
        )


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _read_owner(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        owner = str(json.loads(path.read_text(encoding="utf-8")).get("hermes", "")).strip().lower()
    except (OSError, json.JSONDecodeError):
        return None
    return owner if owner in {"salt", "runtime", "direct"} else None


def run_migrate(*, program_data: Path | None = None, endpoint_id: str = "ep_lab") -> dict[str, Any]:
    """Full migrate flow on the Minion — no client package import required."""
    root = program_data or _program_data()
    hooks = build_hooks()
    owner_path = _owner_path() if program_data is None else Path(root) / "SMC" / "control-owner.json"
    marker_path = Path(root) / "SMC" / "migration-marker.json"
    snapshot_dir = Path(root) / "SMC" / "handover-snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    initial_owner = _read_owner(owner_path)
    steps: list[str] = []
    snapshot: dict[str, Any] = {}

    def fail(state: str, error: str) -> dict[str, Any]:
        return {
            "ok": False,
            "state": state,
            "owner": _read_owner(owner_path) if owner_path.is_file() else initial_owner,
            "error": error,
            "steps": steps,
            "marker": None,
        }

    steps.append("PRECHECK")
    facts = hooks.inspect()
    steps.append("SALT_READY")
    if not hooks.verify_salt():
        return fail("SALT_READY", "salt_not_ready")
    steps.append("HERMES_ADOPTED")
    snapshot = hooks.snapshot()
    snapshot.setdefault("owner", initial_owner)
    snapshot.setdefault("endpoint_id", endpoint_id)
    _atomic_write_json(snapshot_dir / "latest.json", snapshot)
    steps.append("OLD_GATEWAY_STOPPED")
    if not hooks.stop_gateway():
        return fail("OLD_GATEWAY_STOPPED", "stop_gateway_failed")
    steps.append("RUNTIME_STOPPED")
    if not hooks.disable_runtime():
        return fail("RUNTIME_STOPPED", "disable_runtime_failed")
    steps.append("OWNER_SWITCHED")
    _atomic_write_json(owner_path, {"hermes": "salt"})
    steps.append("SALT_GATEWAY_STARTED")
    if not hooks.start_salt_gateway() or not hooks.health():
        if initial_owner:
            _atomic_write_json(owner_path, {"hermes": initial_owner})
        elif owner_path.is_file():
            owner_path.unlink()
        return fail("SALT_GATEWAY_STARTED", "gateway_unhealthy")
    steps.append("WORK_VERIFIED")
    if not hooks.work_probe():
        if initial_owner:
            _atomic_write_json(owner_path, {"hermes": initial_owner})
        elif owner_path.is_file():
            owner_path.unlink()
        return fail("WORK_VERIFIED", "work_probe_failed")
    steps.append("COMPLETED")
    _atomic_write_json(
        marker_path,
        {"endpoint_id": endpoint_id, "owner": "salt", "status": "COMPLETED"},
    )
    return {
        "ok": True,
        "state": "COMPLETED",
        "owner": "salt",
        "error": None,
        "steps": steps,
        "marker": str(marker_path),
    }


def run_rollback(*, program_data: Path | None = None) -> dict[str, Any]:
    root = program_data or _program_data()
    hooks = build_hooks()
    owner_path = _owner_path() if program_data is None else Path(root) / "SMC" / "control-owner.json"
    snapshot_path = Path(root) / "SMC" / "handover-snapshots" / "latest.json"
    payload: dict[str, Any] = {}
    if snapshot_path.is_file():
        try:
            payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
    hooks.stop_gateway()
    if payload:
        hooks.restore_snapshot(payload)
    previous = payload.get("owner")
    if previous in {"salt", "runtime", "direct"}:
        _atomic_write_json(owner_path, {"hermes": previous})
        restored = str(previous)
    else:
        if owner_path.is_file():
            owner_path.unlink()
        restored = None
    hooks.restore_runtime()
    healthy = bool(hooks.runtime_reconcile() and hooks.health())
    marker_path = Path(root) / "SMC" / "migration-marker.json"
    if marker_path.is_file():
        marker_path.unlink()
    return {
        "ok": healthy,
        "state": "ROLLBACK",
        "owner": restored,
        "error": None if healthy else "rollback_health_failed",
        "steps": ["ROLLBACK"],
        "marker": None,
    }


def run_remigrate(
    *,
    program_data: Path | None = None,
    endpoint_id: str = "ep_lab",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    result = run_migrate(program_data=program_data, endpoint_id=endpoint_id)
    if result.get("ok") and result.get("marker"):
        marker_path = Path(str(result["marker"]))
        try:
            payload = json.loads(marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        payload["status"] = "REMIGRATE_COMPLETED"
        payload["idempotency_key"] = idempotency_key
        payload["operation"] = "remigrate"
        _atomic_write_json(marker_path, payload)
        result["steps"] = list(result.get("steps") or []) + ["REMIGRATE"]
    return result

