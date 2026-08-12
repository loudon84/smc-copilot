"""Production Windows handover hooks for PS -HooksModule and Salt modules."""

from __future__ import annotations

# Re-export from extension utils when available; keep a local copy for script path imports.
try:
    from _utils.smc_handover_hooks import (  # type: ignore[import-not-found]
        build_hooks,
        disable_runtime,
        health,
        inspect,
        restore_runtime,
        restore_snapshot,
        runtime_reconcile,
        snapshot,
        start_salt_gateway,
        stop_gateway,
        verify_salt,
        work_probe,
    )
except Exception:  # noqa: BLE001 — script path without Salt dunder
    import json
    import os
    import subprocess
    from pathlib import Path
    from typing import Any

    from client.handover import HandoverHooks

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
        return health()

    def health() -> bool:
        return _http_ok(f"http://127.0.0.1:{_gateway_port()}/health")

    def work_probe() -> bool:
        port = _gateway_port()
        if not _http_ok(f"http://127.0.0.1:{port}/health"):
            return False
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

    def build_hooks() -> HandoverHooks:
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


__all__ = ["build_hooks"]
