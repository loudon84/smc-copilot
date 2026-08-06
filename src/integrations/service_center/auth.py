"""Ed25519 device key helpers + DPAPI-backed private key storage."""

from __future__ import annotations

import base64
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from core.config import Settings
from services.secret_service import SecretStore

DEVICE_PRIVATE_KEY_PREFIX = "endpoint:device_private_key:"
REFRESH_CREDENTIAL_PREFIX = "endpoint:refresh_credential:"


@dataclass(frozen=True)
class DeviceKeyPair:
    public_key_b64: str
    private_key_b64: str


def generate_device_keypair() -> DeviceKeyPair:
    private = Ed25519PrivateKey.generate()
    public = private.public_key()
    private_raw = private.private_bytes_raw()
    public_raw = public.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return DeviceKeyPair(
        public_key_b64=base64.b64encode(public_raw).decode("ascii"),
        private_key_b64=base64.b64encode(private_raw).decode("ascii"),
    )


def sign_message(private_key_b64: str, message: bytes) -> str:
    raw = base64.b64decode(private_key_b64)
    private = Ed25519PrivateKey.from_private_bytes(raw)
    sig = private.sign(message)
    return base64.b64encode(sig).decode("ascii")


def verify_signature(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    try:
        public = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        public.verify(base64.b64decode(signature_b64), message)
        return True
    except Exception:
        return False


class DeviceKeyStore:
    """Persist endpoint private key / refresh credential via SecretStore (DPAPI when available)."""

    def __init__(self, settings: Settings) -> None:
        self._store = SecretStore(settings)

    def store_private_key(self, endpoint_id: str, private_key_b64: str) -> str:
        key = f"{DEVICE_PRIVATE_KEY_PREFIX}{endpoint_id}"
        self._store.put(key, private_key_b64)
        return key

    def load_private_key(self, storage_key: str) -> str | None:
        return self._store.get(storage_key)

    def store_refresh_credential(self, endpoint_id: str, credential: str) -> str:
        key = f"{REFRESH_CREDENTIAL_PREFIX}{endpoint_id}"
        self._store.put(key, credential)
        return key

    def load_refresh_credential(self, storage_key: str) -> str | None:
        return self._store.get(storage_key)

    def delete(self, storage_key: str) -> None:
        self._store.delete(storage_key)
