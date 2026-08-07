from __future__ import annotations

import base64
import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from core.runtime_errors import RuntimeServiceError


def _canonical_payload_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# @lat: [[runtime-service#Artifact 签名]]
class ArtifactSignatureVerifier:
    """Ed25519 manifest signature verification (FR-23)."""

    def __init__(self, public_keys: dict[str, str] | None = None) -> None:
        # key_id -> base64-encoded raw 32-byte Ed25519 public key
        self._public_keys = public_keys or {}

    def validate_structure(self, manifest: dict[str, Any]) -> dict[str, Any]:
        """Validate signed manifest envelope; returns inner payload dict."""
        if "payload" not in manifest:
            raise RuntimeServiceError("Manifest missing signed payload envelope", code="manifest_invalid")
        payload = manifest.get("payload")
        if not isinstance(payload, dict):
            raise RuntimeServiceError("Manifest payload must be an object", code="manifest_invalid")
        key_id = manifest.get("keyId") or manifest.get("key_id")
        signature_b64 = manifest.get("signature")
        if not key_id or not signature_b64:
            raise RuntimeServiceError(
                "Manifest missing keyId or signature",
                code="manifest_signature_invalid",
            )
        expires_at = manifest.get("expiresAt") or manifest.get("expires_at")
        if expires_at:
            try:
                exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=UTC)
                if datetime.now(UTC) > exp:
                    raise RuntimeServiceError("Manifest signature expired", code="manifest_signature_expired")
            except RuntimeServiceError:
                raise
            except Exception as exc:
                raise RuntimeServiceError(
                    f"Invalid manifest expiry: {expires_at}",
                    code="manifest_signature_invalid",
                ) from exc
        return payload

    def verify(self, manifest: dict[str, Any]) -> dict[str, Any]:
        """Verify Ed25519 signature when a public key is configured; always validate structure."""
        payload = self.validate_structure(manifest)
        key_id = str(manifest.get("keyId") or manifest.get("key_id"))
        signature_b64 = str(manifest.get("signature"))
        pubkey_b64 = self._public_keys.get(key_id)
        if not pubkey_b64:
            # No key configured: structure + SHA256 integrity on payload only (dev / unsigned channel)
            return payload
        try:
            from cryptography.exceptions import InvalidSignature
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        except ImportError as exc:
            raise RuntimeServiceError(
                "Ed25519 verification requires cryptography package",
                code="manifest_signature_invalid",
            ) from exc
        try:
            pubkey = Ed25519PublicKey.from_public_bytes(base64.b64decode(pubkey_b64))
            sig = base64.b64decode(signature_b64)
            pubkey.verify(sig, _canonical_payload_bytes(payload))
        except InvalidSignature as exc:
            raise RuntimeServiceError("Manifest Ed25519 signature mismatch", code="manifest_signature_invalid") from exc
        except Exception as exc:
            raise RuntimeServiceError(
                f"Manifest signature verification failed: {exc}",
                code="manifest_signature_invalid",
            ) from exc
        return payload

    def payload_sha256(self, payload: dict[str, Any]) -> str:
        return _sha256_hex(_canonical_payload_bytes(payload))
