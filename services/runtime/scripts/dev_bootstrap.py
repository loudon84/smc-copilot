#!/usr/bin/env python3
"""PRD v1.4.1 — Dev Hermes registration bootstrap before uvicorn.

Discover local Hermes → register RuntimeVersion → ensure default instance.

Exit codes:
  0 — success or Hermes missing (and HERMES_DEV_REQUIRED != 1)
  non-zero — explicit/invalid Hermes, validation failure, or DB write failure
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


def _log(msg: str) -> None:
    print(f"[dev_bootstrap] {msg}", flush=True)


async def _run() -> int:
    src = Path(__file__).resolve().parents[1] / "src"
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))

    from core.config import Settings
    from db.session import create_engine, create_sessionmaker
    from services.dev_hermes_registration_service import (
        DevHermesRegistrationError,
        DevHermesRegistrationService,
    )

    settings = Settings()
    engine = create_engine(settings)
    session_maker = create_sessionmaker(engine)

    try:
        result = await DevHermesRegistrationService(settings, session_maker).register()
    except DevHermesRegistrationError as exc:
        _log(f"error: {exc}")
        _log("status: failed")
        return 1
    except Exception as exc:  # noqa: BLE001 — surface unexpected bootstrap failures
        _log(f"error: unexpected bootstrap failure: {exc}")
        _log("status: failed")
        return 1

    if result.status == "skipped":
        _log(result.message or "Local Hermes was not found.")
        _log("status: ready (service-only)")
        return 0

    _log(f"Hermes discovered:\n{result.executable}")
    _log(f"Hermes version:\n{result.version}")
    _log(f"RuntimeVersion:\n{result.message or 'registered / active'}")
    _log("Default Instance:\nready")
    _log("Gateway:\nwill auto-start with Runtime")
    _log("status:\nready")
    return 0


def main() -> int:
    _log("status: starting")
    try:
        return asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        _log(f"error: {exc}")
        _log("status: failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
