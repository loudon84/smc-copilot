#!/usr/bin/env python3
"""PRD v1.4 §44 — Dev bootstrap before uvicorn.

Reads HERMES_DEV_EXECUTABLE, validates it when set, and best-effort ensures a
default Hermes instance via InstallationService / DB helpers when importable.

Always exits 0 so `nx run runtime:dev` can still start uvicorn.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _log(msg: str) -> None:
    print(f"[dev_bootstrap] {msg}", flush=True)


def _validate_hermes_executable(exe: str) -> bool:
    path = Path(exe).expanduser()
    if not path.is_file():
        # Allow bare command names on PATH
        resolved = shutil.which(exe)
        if not resolved:
            _log(f"HERMES_DEV_EXECUTABLE not found: {exe}")
            _log("  → Set HERMES_DEV_EXECUTABLE to a real hermes binary, or leave unset.")
            return False
        path = Path(resolved)

    _log(f"HERMES_DEV_EXECUTABLE ok: {path}")
    try:
        result = subprocess.run(
            [str(path), "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        version = (result.stdout or result.stderr or "").strip().splitlines()
        if version:
            _log(f"hermes --version: {version[0][:200]}")
        elif result.returncode != 0:
            _log(f"hermes --version exit={result.returncode} (continuing)")
    except Exception as exc:  # noqa: BLE001 — bootstrap must never block uvicorn
        _log(f"hermes --version skipped: {exc}")

    _log("Runtime should register this Hermes via install/activation (dev).")
    return True


async def _ensure_default_instance_best_effort() -> None:
    """Try InstallationService / DB patterns; print clear steps on failure."""
    try:
        # Ensure src/ is on path when invoked as `uv run python scripts/dev_bootstrap.py`
        src = Path(__file__).resolve().parents[1] / "src"
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))

        from core.config import Settings
        from db.session import create_engine, create_sessionmaker
        from sqlalchemy import select
        from db.models.runtime import HermesInstance

        settings = Settings()
        engine = create_engine(settings)
        session_maker = create_sessionmaker(engine)

        async with session_maker() as session:
            result = await session.execute(
                select(HermesInstance).where(HermesInstance.name == "default")
            )
            existing = result.scalar_one_or_none()
            if existing:
                _log(f"default Hermes instance already present: id={existing.id}")
                return

            # Prefer InstallationService._ensure_default_instance when a version row exists
            try:
                from services.installation_service import InstallationService
                from db.models.runtime import RuntimeVersion

                ver = (
                    await session.execute(select(RuntimeVersion).limit(1))
                ).scalar_one_or_none()
                if ver is not None:
                    install = InstallationService(settings, session_maker)
                    instance_id = await install._ensure_default_instance(session, ver.id)
                    await session.commit()
                    _log(f"ensured default instance via InstallationService: {instance_id}")
                    return
            except Exception as exc:  # noqa: BLE001
                _log(f"InstallationService ensure skipped: {exc}")

            _log("No default Hermes instance and no RuntimeVersion row yet.")
            _log("  → After uvicorn starts, POST /api/v1/runtime/install or use UI Install Job.")
            _log("  → Or set HERMES_DEV_EXECUTABLE and re-run once a version is activated.")
    except Exception as exc:  # noqa: BLE001
        _log(f"ensure default instance skipped (import/db): {exc}")
        _log("  → Run `uv run alembic upgrade head` then start uvicorn; install Hermes via API.")


def main() -> int:
    _log("status: starting")
    exe = os.environ.get("HERMES_DEV_EXECUTABLE", "").strip()
    if exe:
        _validate_hermes_executable(exe)
    else:
        _log("HERMES_DEV_EXECUTABLE unset — skipping Hermes path validation.")
        _log("  → Optional: export HERMES_DEV_EXECUTABLE=/path/to/hermes for local registration hints.")

    try:
        asyncio.run(_ensure_default_instance_best_effort())
    except Exception as exc:  # noqa: BLE001
        _log(f"async bootstrap skipped: {exc}")

    _log("status: done (exit 0 — uvicorn may start)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
