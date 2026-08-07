from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


class ChecksumVerifier:
    def verify_file(self, path: Path, expected_sha256: str) -> bool:
        actual = sha256_file(path)
        return actual.lower() == expected_sha256.lower()

    def verify_bytes(self, data: bytes, expected_sha256: str) -> bool:
        return sha256_hex(data).lower() == expected_sha256.lower()
