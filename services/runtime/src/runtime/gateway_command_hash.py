"""Gateway command fingerprint hashing (PRD v1.5.1 §55)."""

from __future__ import annotations

import hashlib
from pathlib import Path


GATEWAY_FINGERPRINT_VERSION = 1


def compute_gateway_command_hash(
    *,
    executable: str | Path | None,
    profile_name: str,
    port: int,
    command: list[str] | None = None,
) -> str:
    """Hash normalized gateway spawn identity. Never includes secrets."""
    exe = str(Path(executable).resolve()) if executable else ""
    parts = [
        exe.lower(),
        (profile_name or "").strip().lower(),
        "gateway",
        "run",
        "--external-supervisor",
        str(int(port)),
    ]
    if command:
        # Include normalized argv tokens that are not secret-bearing.
        safe = []
        for tok in command:
            t = str(tok)
            if "API_SERVER_KEY" in t.upper() or "BEARER" in t.upper() or "TOKEN=" in t.upper():
                continue
            safe.append(t.lower())
        parts.extend(safe)
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return digest
