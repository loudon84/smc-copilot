"""Secure minion enrollment state machine (PRD v2.1 §8).

Production Master must keep auto_accept=false. The client never accepts keys.
Enrollment failure must not switch control-owner.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Literal

EnrollmentState = Literal[
    "created",
    "client_installed",
    "key_generated",
    "fingerprint_reported",
    "pending_match",
    "accepted",
    "synced",
    "highstate",
    "failed",
]

HEX_FINGER = re.compile(r"^[0-9a-fA-F:]{32,}$")


@dataclass
class EnrollmentContext:
    endpoint_id: str
    master: str
    master_fingerprint: str
    enrollment_token: str
    backend_url: str = ""
    local_pubkey_fingerprint: str | None = None
    master_pending_fingerprint: str | None = None
    control_owner: str | None = None
    state: EnrollmentState = "created"
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def normalize_fingerprint(value: str) -> str:
    return re.sub(r"[^0-9a-fA-F]", "", value).lower()


def fingerprints_match(local: str, master_pending: str) -> bool:
    left = normalize_fingerprint(local)
    right = normalize_fingerprint(master_pending)
    return bool(left) and left == right


def fingerprint_from_pubkey_pem(pem: str) -> str:
    """SHA-256 hex of the PEM body (repo-only stand-in for salt-key fingerprint)."""
    body = "".join(line.strip() for line in pem.splitlines() if "CERTIFICATE" not in line and "KEY" not in line)
    digest = hashlib.sha256(body.encode("ascii", errors="ignore")).hexdigest()
    return ":".join(digest[i : i + 2] for i in range(0, 64, 2))


def validate_master_fingerprint(master_fingerprint: str) -> bool:
    return bool(normalize_fingerprint(master_fingerprint)) and len(normalize_fingerprint(master_fingerprint)) >= 32


def start_enrollment(
    *,
    endpoint_id: str,
    master: str,
    master_fingerprint: str,
    enrollment_token: str,
    backend_url: str = "",
) -> EnrollmentContext:
    if not endpoint_id or endpoint_id.lower() in {"hostname", "username"}:
        raise ValueError("endpoint_id must be a stable device id, not hostname/username")
    if not enrollment_token.strip():
        raise ValueError("enrollment_token is required")
    if not validate_master_fingerprint(master_fingerprint):
        raise ValueError("master_fingerprint is invalid")
    return EnrollmentContext(
        endpoint_id=endpoint_id,
        master=master,
        master_fingerprint=master_fingerprint,
        enrollment_token=enrollment_token.strip(),
        backend_url=backend_url,
        state="created",
    )


def advance(ctx: EnrollmentContext, event: str, **payload: Any) -> EnrollmentContext:
    """Advance enrollment. Never mutates control_owner."""
    previous_owner = ctx.control_owner
    try:
        ctx = _advance_inner(ctx, event, payload)
    except Exception as exc:  # noqa: BLE001 — enrollment must fail closed
        ctx.state = "failed"
        ctx.error = str(exc)
    ctx.control_owner = previous_owner
    return ctx


def _advance_inner(ctx: EnrollmentContext, event: str, payload: dict[str, Any]) -> EnrollmentContext:
    if event == "minion_installed":
        ctx.state = "client_installed"
        return ctx
    if event == "key_generated":
        pem = str(payload.get("pubkey_pem") or "")
        fp = str(payload.get("fingerprint") or "")
        ctx.local_pubkey_fingerprint = fp or (fingerprint_from_pubkey_pem(pem) if pem else None)
        if not ctx.local_pubkey_fingerprint:
            raise ValueError("minion public key fingerprint missing")
        ctx.state = "key_generated"
        return ctx
    if event == "fingerprint_reported":
        ctx.state = "fingerprint_reported"
        return ctx
    if event == "master_pending":
        ctx.master_pending_fingerprint = str(payload.get("fingerprint") or "")
        if not fingerprints_match(ctx.local_pubkey_fingerprint or "", ctx.master_pending_fingerprint):
            raise ValueError("minion and master pending fingerprints do not match")
        ctx.state = "pending_match"
        return ctx
    if event == "key_accepted":
        if ctx.state not in {"pending_match", "fingerprint_reported"}:
            raise ValueError("cannot accept key before fingerprint match")
        ctx.state = "accepted"
        return ctx
    if event == "ping_ok":
        if ctx.state != "accepted":
            raise ValueError("ping requires accepted key")
        ctx.state = "synced" if payload.get("synced") else "accepted"
        if payload.get("synced"):
            ctx.state = "synced"
        return ctx
    if event == "sync_all":
        if ctx.state not in {"accepted", "synced"}:
            raise ValueError("sync_all requires accepted key")
        ctx.state = "synced"
        return ctx
    if event == "highstate":
        if ctx.state != "synced":
            raise ValueError("highstate requires sync_all")
        ctx.state = "highstate"
        return ctx
    if event == "fail":
        raise ValueError(str(payload.get("error") or "enrollment failed"))
    raise ValueError(f"unknown enrollment event: {event}")


def enrollment_complete(ctx: EnrollmentContext) -> bool:
    return ctx.state == "highstate"


def mock_backend_start_enrollment(token: str, hostname: str | None = None) -> dict[str, str]:
    """Repo-only Backend enrollment/start stand-in. Endpoint id is not hostname."""
    del hostname
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
    return {
        "endpoint_id": f"ep_{digest}",
        "status": "created",
    }
