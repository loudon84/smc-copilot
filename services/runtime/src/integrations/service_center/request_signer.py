"""Device request signing for Service Center (PRD v1.6 FR-105)."""

from __future__ import annotations

import hashlib
import time
from uuid import uuid4

from integrations.service_center.auth import sign_message, verify_signature


def body_sha256(body: bytes | None) -> str:
    return hashlib.sha256(body or b"").hexdigest()


def signing_payload(*, method: str, path: str, body_digest: str, timestamp: str, nonce: str) -> bytes:
    return f"{method.upper()}\n{path}\n{body_digest}\n{timestamp}\n{nonce}".encode()


def build_signed_headers(
    *,
    method: str,
    path: str,
    body: bytes | None,
    endpoint_id: str,
    private_key_b64: str,
    request_id: str | None = None,
    timestamp: str | None = None,
    nonce: str | None = None,
) -> dict[str, str]:
    ts = timestamp or str(int(time.time()))
    n = nonce or uuid4().hex
    rid = request_id or uuid4().hex
    digest = body_sha256(body)
    payload = signing_payload(method=method, path=path, body_digest=digest, timestamp=ts, nonce=n)
    sig = sign_message(private_key_b64, payload)
    return {
        "X-Endpoint-Id": endpoint_id,
        "X-Request-Id": rid,
        "X-Timestamp": ts,
        "X-Nonce": n,
        "X-Body-SHA256": digest,
        "X-Device-Signature": sig,
    }


def verify_request_signature(
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

    ts = _get("X-Timestamp")
    nonce = _get("X-Nonce")
    digest = _get("X-Body-SHA256")
    sig = _get("X-Device-Signature")
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
