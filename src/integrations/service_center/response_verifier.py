"""Verify signed Service Center responses (PRD v1.6 FR-105)."""

from __future__ import annotations

import time

from integrations.service_center.auth import verify_signature
from integrations.service_center.request_signer import body_sha256, signing_payload


def verify_response_signature(
    *,
    method: str,
    path: str,
    body: bytes | None,
    headers: dict[str, str],
    public_key_b64: str,
    max_skew_seconds: int = 300,
) -> bool:
    def _get(name: str) -> str:
        for k, v in headers.items():
            if k.lower() == name.lower():
                return v
        return ""

    ts = _get("X-Timestamp") or _get("X-Response-Timestamp")
    nonce = _get("X-Nonce") or _get("X-Response-Nonce")
    digest = _get("X-Body-SHA256") or _get("X-Response-Body-SHA256")
    sig = _get("X-Center-Signature") or _get("X-Device-Signature")
    if not (ts and nonce and digest and sig):
        return False
    try:
        skew = abs(int(time.time()) - int(ts))
    except ValueError:
        return False
    if skew > max_skew_seconds:
        return False
    if digest != body_sha256(body):
        return False
    payload = signing_payload(method=method, path=path, body_digest=digest, timestamp=ts, nonce=nonce)
    return verify_signature(public_key_b64, payload, sig)
