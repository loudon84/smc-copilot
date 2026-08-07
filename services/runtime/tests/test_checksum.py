from __future__ import annotations

from runtime.checksum_verifier import ChecksumVerifier, sha256_hex


def test_sha256_hex_known_value() -> None:
    assert sha256_hex(b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_checksum_verifier_bytes() -> None:
    verifier = ChecksumVerifier()
    assert verifier.verify_bytes(b"abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    assert not verifier.verify_bytes(b"abc", "deadbeef")
