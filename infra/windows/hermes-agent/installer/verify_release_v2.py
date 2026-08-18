#!/usr/bin/env python3
"""Verify smc.hermes.release.v2 signature and archive digest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cryptography.hazmat.primitives import serialization
from tools.release.hermes.release_v2 import verify_release_manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--signature", type=Path, required=True)
    parser.add_argument("--public-key", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    digest = __import__("hashlib").sha256(args.archive.read_bytes()).hexdigest()
    public = serialization.load_pem_public_key(args.public_key.read_bytes())
    verify_release_manifest(manifest, digest, args.signature.read_bytes(), public)
    print("[verify_release_v2] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
