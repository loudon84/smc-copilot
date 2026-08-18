from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from core.config import Settings
from core.errors import ErrorCode, OpsiControlError


@dataclass(frozen=True)
class ArtifactTokenClaims:
    artifact_id: str
    artifact_type: str
    client_id: str
    request_id: str
    direction: Literal["upload", "download"]
    expires_at: int
    max_bytes: int


def _secret(settings: Settings) -> bytes:
    material = settings.artifact_hmac_secret or settings.jwt_lab_secret
    return material.encode("utf-8")


def mint_artifact_token(claims: ArtifactTokenClaims, *, settings: Settings) -> str:
    payload = {
        "artifactId": claims.artifact_id,
        "artifactType": claims.artifact_type,
        "clientId": claims.client_id,
        "requestId": claims.request_id,
        "direction": claims.direction,
        "exp": claims.expires_at,
        "maxBytes": claims.max_bytes,
        "nonce": secrets.token_hex(8),
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(_secret(settings), body, hashlib.sha256).hexdigest()
    return f"{body.decode('utf-8')}.{sig}"


def verify_artifact_token(
    token: str,
    *,
    settings: Settings,
    artifact_id: str,
    client_id: str,
    request_id: str,
    direction: Literal["upload", "download"],
    size_bytes: int = 0,
) -> ArtifactTokenClaims:
    if "." not in token:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "artifact token malformed", status_code=400)
    body_text, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret(settings), body_text.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token signature invalid", status_code=403)
    payload = json.loads(body_text)
    if payload.get("artifactId") != artifact_id:
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token binding mismatch", status_code=403)
    if payload.get("clientId") != client_id:
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token client mismatch", status_code=403)
    if payload.get("requestId") != request_id:
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token request mismatch", status_code=403)
    if payload.get("direction") != direction:
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token direction mismatch", status_code=403)
    if int(payload.get("exp") or 0) < int(time.time()):
        raise OpsiControlError(ErrorCode.FORBIDDEN, "artifact token expired", status_code=403)
    max_bytes = int(payload.get("maxBytes") or settings.artifact_max_bytes)
    if size_bytes and size_bytes > max_bytes:
        raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "artifact exceeds maxBytes", status_code=413)
    return ArtifactTokenClaims(
        artifact_id=artifact_id,
        artifact_type=str(payload.get("artifactType") or ""),
        client_id=client_id,
        request_id=request_id,
        direction=direction,
        expires_at=int(payload.get("exp") or 0),
        max_bytes=max_bytes,
    )


def token_expiry(settings: Settings) -> datetime:
    return datetime.now(UTC) + timedelta(seconds=settings.artifact_token_ttl_seconds)
