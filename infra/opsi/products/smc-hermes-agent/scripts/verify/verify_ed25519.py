#!/usr/bin/env python3
"""Verify OPSI Hermes artifact envelope v2 (Ed25519)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packaging"))
from artifact_v2 import sha256_file, verify_envelope  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--signature", type=Path, required=True)
    parser.add_argument("--public-key", type=Path, required=True)
    parser.add_argument("--expected-key-id", default="")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if args.expected_key_id and manifest.get("keyId") != args.expected_key_id:
        print("key id mismatch", file=sys.stderr)
        return 2
    digest = sha256_file(args.artifact)
    public = serialization.load_pem_public_key(args.public_key.read_bytes())
    if not isinstance(public, Ed25519PublicKey):
        print("public key is not Ed25519", file=sys.stderr)
        return 2
    try:
        verify_envelope(manifest, digest, args.signature.read_bytes(), public)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
