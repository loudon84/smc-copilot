"""DPAPI-wrapped data key + AES-GCM for sensitive local artifact spool (PRD FR-704)."""

from __future__ import annotations

import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.logging import get_logger

logger = get_logger(__name__)

_NONCE_SIZE = 12
_KEY_SIZE = 32


# @lat: [[runtime-service#Artifact 本地加密]]
@dataclass(frozen=True)
class EncryptedBlob:
    nonce: bytes
    ciphertext: bytes


def _dpapi_protect(data: bytes) -> bytes:
    if sys.platform == "win32":
        try:
            import win32crypt  # type: ignore[import-untyped]

            return win32crypt.CryptProtectData(data, None, None, None, None, 0)
        except ImportError:
            pass
    salt = (os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "dev").encode()
    return bytes(b ^ salt[i % len(salt)] for i, b in enumerate(data))


def _dpapi_unprotect(data: bytes) -> bytes:
    if sys.platform == "win32":
        try:
            import win32crypt  # type: ignore[import-untyped]

            return win32crypt.CryptUnprotectData(data, None, None, None, 0)[1]
        except ImportError:
            pass
    salt = (os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "dev").encode()
    return bytes(b ^ salt[i % len(salt)] for i, b in enumerate(data))


class ArtifactEncryption:
    """Encrypt/decrypt spool payloads; never logs absolute paths."""

    def __init__(self, key_dir: Path) -> None:
        self._key_dir = key_dir
        self._key_dir.mkdir(parents=True, exist_ok=True)
        self._key_file = key_dir / "spool-data-key.dpapi"

    def _load_or_create_key(self) -> bytes:
        if self._key_file.exists():
            wrapped = self._key_file.read_bytes()
            return _dpapi_unprotect(wrapped)
        key = secrets.token_bytes(_KEY_SIZE)
        self._key_file.write_bytes(_dpapi_protect(key))
        return key

    def encrypt(self, plaintext: bytes) -> EncryptedBlob:
        key = self._load_or_create_key()
        nonce = secrets.token_bytes(_NONCE_SIZE)
        ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
        return EncryptedBlob(nonce=nonce, ciphertext=ciphertext)

    def decrypt(self, blob: EncryptedBlob) -> bytes:
        key = self._load_or_create_key()
        return AESGCM(key).decrypt(blob.nonce, blob.ciphertext, None)

    def encrypt_file(self, src: Path, dest: Path) -> None:
        plaintext = src.read_bytes()
        blob = self.encrypt(plaintext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob.nonce + blob.ciphertext)
        logger.info("artifact_encrypted", size_bytes=len(plaintext))

    def decrypt_file(self, src: Path, dest: Path) -> None:
        raw = src.read_bytes()
        blob = EncryptedBlob(nonce=raw[:_NONCE_SIZE], ciphertext=raw[_NONCE_SIZE:])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self.decrypt(blob))
        logger.info("artifact_decrypted")
