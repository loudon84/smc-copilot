#!/usr/bin/env python3
"""Self-contained Ed25519 envelope verifier used by builders and tests.

Windows endpoints invoke the bundled PowerShell verifier (smc-artifact-verify.ps1)
with this module's digest pinned in the release index. System Python is not used
on the production verify path.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_v3 import sha256_file, verify_envelope  # noqa: E402
from controller_manifest import verify_manifest  # noqa: E402
from product_release import verify_index  # noqa: E402


def _public(path: Path) -> Ed25519PublicKey:
    key = serialization.load_pem_public_key(path.read_bytes())
    if not isinstance(key, Ed25519PublicKey):
        raise SystemExit("public key is not Ed25519")
    return key


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("runtime", "controller", "release"), default="runtime")
    parser.add_argument("--artifact", type=Path)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--signature", type=Path)
    parser.add_argument("--public-key", type=Path, required=True)
    parser.add_argument("--expected-key-id", default="")
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    key_id = manifest.get("keyId") or manifest.get("signerKeyId")
    if args.expected_key_id and key_id != args.expected_key_id:
        print("key id mismatch", file=sys.stderr)
        return 2
    public = _public(args.public_key)
    if args.kind == "runtime":
        if args.artifact is None or args.signature is None:
            raise SystemExit("runtime verify requires --artifact and --signature")
        verify_envelope(manifest, sha256_file(args.artifact), args.signature.read_bytes(), public)
    elif args.kind == "controller":
        verify_manifest(manifest, public, args.bundle)
    else:
        verify_index(manifest, public)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
