"""Runtime maintenance process (PRD v1.5 FR-03).

Performs: verify → stop UserDaemon → backup DB → replace bundle → alembic → start → health.
On failure: restore previous install dir + DB and restart old runtime.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from runtime.bundle_security import (
    BundleLimits,
    BundleSecurityError,
    safe_extract_zip,
    verify_bundle_artifact,
)


def _step(steps: list[dict[str, Any]], name: str, status: str, detail: str | None = None) -> None:
    steps.append({"step": name, "status": status, "detail": detail, "at": datetime.now(UTC).isoformat()})


def _health_ok(url: str, timeout_sec: float = 60.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as resp:  # noqa: S310 — loopback health only
                if resp.status == 200:
                    return True
        except (URLError, OSError, TimeoutError):
            pass
        time.sleep(0.5)
    return False


def _run(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True, check=False)


# @lat: [[runtime-service#Runtime Service 更新]]
def apply_maintenance(
    *,
    artifact: Path,
    install_dir: Path,
    db_path: Path,
    backup_dir: Path,
    port: int = 8765,
    health_url: str | None = None,
    python_exe: str | None = None,
    expected_sha256: str | None = None,
    signature_b64: str | None = None,
    public_key: str | None = None,
    expected_version: str | None = None,
) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    health = health_url or f"http://127.0.0.1:{port}/api/v1/health"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    bundle_backup = backup_dir / f"install-{stamp}"
    db_backup = backup_dir / f"db-{stamp}.sqlite"

    if not artifact.exists():
        _step(steps, "verify", "failed", f"missing {artifact}")
        return {"ok": False, "applied": False, "steps": steps, "error": "artifact_missing"}

    try:
        manifest = verify_bundle_artifact(
            artifact,
            expected_sha256=expected_sha256,
            signature_b64=signature_b64,
            public_key=public_key,
            expected_version=expected_version,
            limits=BundleLimits(),
        )
        _step(steps, "verify", "ok", f"artifact={artifact.name}; version={manifest.get('version')}")
    except BundleSecurityError as exc:
        _step(steps, "verify", "failed", str(exc))
        return {"ok": False, "applied": False, "steps": steps, "error": exc.code}

    # Stop UserDaemon / uvicorn on port
    stop = _run([sys.executable, "-m", "local_service.windows_user_daemon", "stop", "--port", str(port)])
    _step(steps, "stop_daemon", "ok" if stop.returncode == 0 else "degraded", stop.stderr.strip() or stop.stdout.strip())

    # Backup DB
    try:
        if db_path.exists():
            shutil.copy2(db_path, db_backup)
            _step(steps, "backup_db", "ok", str(db_backup))
        else:
            _step(steps, "backup_db", "ok", "no existing db")
    except OSError as exc:
        _step(steps, "backup_db", "failed", str(exc))
        return {"ok": False, "applied": False, "steps": steps, "error": "backup_failed"}

    # Backup current install (if present)
    previous: Path | None = None
    if install_dir.exists():
        if bundle_backup.exists():
            shutil.rmtree(bundle_backup, ignore_errors=True)
        shutil.copytree(install_dir, bundle_backup)
        previous = bundle_backup
        _step(steps, "backup_install", "ok", str(bundle_backup))

    staging = install_dir.parent / f".staging-{stamp}"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    try:
        safe_extract_zip(artifact, staging, limits=BundleLimits())
        _step(steps, "extract", "ok", str(staging))

        # Atomic-ish switch: move old aside, promote staging
        retired = install_dir.parent / f".retired-{stamp}"
        if install_dir.exists():
            if retired.exists():
                shutil.rmtree(retired, ignore_errors=True)
            install_dir.rename(retired)
        staging.rename(install_dir)
        if retired.exists():
            shutil.rmtree(retired, ignore_errors=True)
        _step(steps, "replace", "ok", str(install_dir))
    except (OSError, BundleSecurityError) as exc:
        _step(steps, "replace", "failed", str(exc))
        if previous and previous.exists():
            if install_dir.exists():
                shutil.rmtree(install_dir, ignore_errors=True)
            shutil.copytree(previous, install_dir)
            _step(steps, "rollback_install", "ok", str(previous))
        err = exc.code if isinstance(exc, BundleSecurityError) else "replace_failed"
        return {"ok": False, "applied": False, "steps": steps, "error": err}

    # Alembic
    py = python_exe or sys.executable
    env_pythonpath = str(install_dir / "runtime" / "src")
    mig = _run(
        [py, "-m", "alembic", "upgrade", "head"],
        cwd=install_dir if (install_dir / "migrations").exists() else None,
    )
    # Also try with PYTHONPATH when layout matches bundle
    if mig.returncode != 0:
        import os

        env = os.environ.copy()
        env["PYTHONPATH"] = env_pythonpath
        mig = subprocess.run(
            [py, "-m", "alembic", "upgrade", "head"],
            cwd=str(install_dir),
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
    if mig.returncode != 0:
        _step(steps, "alembic", "failed", (mig.stderr or mig.stdout)[:500])
        if previous and previous.exists():
            if install_dir.exists():
                shutil.rmtree(install_dir, ignore_errors=True)
            shutil.copytree(previous, install_dir)
            if db_backup.exists() and db_path.parent.exists():
                shutil.copy2(db_backup, db_path)
            _run([sys.executable, "-m", "local_service.windows_user_daemon", "start", "--port", str(port)])
            _step(steps, "rollback", "ok", "restored previous install+db")
        return {"ok": False, "applied": False, "steps": steps, "error": "alembic_failed"}
    _step(steps, "alembic", "ok", "upgrade head")

    start = _run([sys.executable, "-m", "local_service.windows_user_daemon", "start", "--port", str(port)])
    _step(steps, "start", "ok" if start.returncode == 0 else "failed", start.stderr.strip() or start.stdout.strip())

    if not _health_ok(health):
        _step(steps, "health", "failed", health)
        if previous and previous.exists():
            _run([sys.executable, "-m", "local_service.windows_user_daemon", "stop", "--port", str(port)])
            if install_dir.exists():
                shutil.rmtree(install_dir, ignore_errors=True)
            shutil.copytree(previous, install_dir)
            if db_backup.exists():
                shutil.copy2(db_backup, db_path)
            _run([sys.executable, "-m", "local_service.windows_user_daemon", "start", "--port", str(port)])
            _step(steps, "rollback", "ok", "health failed; restored")
        return {"ok": False, "applied": False, "steps": steps, "error": "health_failed"}

    _step(steps, "health", "ok", health)
    return {"ok": True, "applied": True, "steps": steps, "versionArtifact": str(artifact)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hermes Runtime maintenance apply")
    parser.add_argument("--artifact", required=True, help="Path to runtime-bundle zip")
    parser.add_argument("--install-dir", required=True, help="Target install directory")
    parser.add_argument("--db-path", required=True, help="SQLite database path")
    parser.add_argument("--backup-dir", required=True, help="Backup directory")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--health-url", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    result = apply_maintenance(
        artifact=Path(args.artifact),
        install_dir=Path(args.install_dir),
        db_path=Path(args.db_path),
        backup_dir=Path(args.backup_dir),
        port=args.port,
        health_url=args.health_url or None,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
