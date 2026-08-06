"""Sync message envelope build/verify helpers (PRD FR-10)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from integrations.service_center.auth import sign_message, verify_signature

PROTOCOL_VERSION = "1.0"


def _canonical_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def payload_hash(payload: dict[str, Any] | str) -> str:
    if isinstance(payload, str):
        raw = payload.encode("utf-8")
    else:
        raw = _canonical_payload(payload)
    return hashlib.sha256(raw).hexdigest()


def build_envelope(
    *,
    message_type: str,
    payload: dict[str, Any],
    endpoint_id: str,
    tenant_id: str,
    sequence: int,
    private_key_b64: str | None = None,
    message_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    mid = message_id or str(uuid4())
    envelope: dict[str, Any] = {
        "protocolVersion": PROTOCOL_VERSION,
        "messageId": mid,
        "idempotencyKey": idempotency_key or mid,
        "tenantId": tenant_id,
        "endpointId": endpoint_id,
        "sequence": sequence,
        "sentAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "messageType": message_type,
        "payload": payload,
        "signature": "",
    }
    if private_key_b64:
        to_sign = _signing_bytes(envelope)
        envelope["signature"] = sign_message(private_key_b64, to_sign)
    return envelope


def _signing_bytes(envelope: dict[str, Any]) -> bytes:
    body = {k: v for k, v in envelope.items() if k != "signature"}
    return _canonical_payload(body)


def verify_envelope(envelope: dict[str, Any], public_key_b64: str) -> bool:
    sig = envelope.get("signature")
    if not sig or not isinstance(sig, str):
        return False
    if envelope.get("protocolVersion") != PROTOCOL_VERSION:
        return False
    return verify_signature(public_key_b64, _signing_bytes(envelope), sig)


def extract_message_meta(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        "message_id": str(envelope.get("messageId") or ""),
        "idempotency_key": envelope.get("idempotencyKey"),
        "message_type": envelope.get("messageType"),
        "sequence": envelope.get("sequence"),
        "payload": envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {},
        "payload_hash": payload_hash(envelope.get("payload") or {}),
    }
