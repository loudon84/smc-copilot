from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from domain.ed25519util import canonical_json, verify_ed25519
from domain.policy import PRODUCTION_REENTRY_GATE

REQUIRED_ROLES = ("release_owner", "endpoint_ops", "security_owner")


@dataclass(frozen=True)
class LiveGateEnvelope:
    gate_id: str
    decision: str
    evidence_ref: str
    expires_at: datetime
    input_digest: str
    payload: dict[str, Any]
    approvals: list[dict[str, str]]


def gate_canonical_payload(payload: dict[str, Any]) -> dict[str, Any]:
    body = dict(payload)
    body.pop("approvals", None)
    body.pop("signature", None)
    return body


def verify_live_gate_envelope(
    envelope: LiveGateEnvelope,
    *,
    now: datetime,
    public_keys: dict[str, str],
    revoked_keys: set[str],
    expected_gate_id: str = PRODUCTION_REENTRY_GATE,
) -> tuple[bool, str]:
    if envelope.gate_id != expected_gate_id:
        return False, "unexpected_gate_id"
    if envelope.decision not in {"GO", "NO-GO"}:
        return False, "invalid_decision"
    if now >= envelope.expires_at.astimezone(UTC):
        return False, "expired"
    canonical = canonical_json(gate_canonical_payload(envelope.payload))
    import hashlib

    digest = hashlib.sha256(canonical).hexdigest()
    if envelope.input_digest and envelope.input_digest != digest:
        return False, "input_digest_mismatch"
    seen: set[str] = set()
    for approval in envelope.approvals:
        role = str(approval.get("role") or "")
        key_id = str(approval.get("keyId") or approval.get("key_id") or "")
        signature = str(approval.get("signature") or "")
        if role not in REQUIRED_ROLES:
            return False, "unknown_role"
        if role in seen:
            return False, "duplicate_role"
        if key_id in revoked_keys:
            return False, "revoked_key"
        public = public_keys.get(key_id)
        if not public:
            return False, "unknown_key"
        if not verify_ed25519(public, canonical, signature):
            return False, "invalid_signature"
        seen.add(role)
    if set(REQUIRED_ROLES) - seen:
        return False, "missing_role"
    return True, "ok"
