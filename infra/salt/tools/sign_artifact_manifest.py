#!/usr/bin/env python3
"""Generate Ed25519 keypair (dev only) and sign a canonical artifact manifest JSON.

Production private keys must live in Release Secret Store — never commit them.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path


def canonical_json(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def generate_keypair() -> tuple[str, str]:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    private = Ed25519PrivateKey.generate()
    private_b64 = base64.b64encode(private.private_bytes_raw()).decode("ascii")
    public_b64 = base64.b64encode(private.public_key().public_bytes_raw()).decode("ascii")
    return private_b64, public_b64


def sign_manifest(manifest: dict, private_key_b64: str) -> dict:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    body = {k: v for k, v in manifest.items() if k not in {"manifestSignature", "signature"}}
    private = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
    sig = private.sign(canonical_json(body))
    out = dict(body)
    out["manifestSignature"] = base64.b64encode(sig).decode("ascii")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    gen = sub.add_parser("gen-keypair", help="Dev-only keypair generation")
    gen.add_argument("--out-dir", type=Path, default=Path("."))

    sign = sub.add_parser("sign", help="Sign canonical manifest JSON")
    sign.add_argument("manifest", type=Path)
    sign.add_argument("--private-key-file", type=Path, required=True)
    sign.add_argument("--out", type=Path, default=None)
    sign.add_argument("--artifact", type=Path, default=None, help="Optional zip to fill sha256/size")

    args = parser.parse_args(argv)
    if args.cmd == "gen-keypair":
        private_b64, public_b64 = generate_keypair()
        args.out_dir.mkdir(parents=True, exist_ok=True)
        (args.out_dir / "ed25519.private.b64").write_text(private_b64 + "\n", encoding="utf-8")
        (args.out_dir / "ed25519.public.b64").write_text(public_b64 + "\n", encoding="utf-8")
        print(json.dumps({"publicKey": public_b64, "warning": "dev_only_do_not_commit_private"}))
        return 0

    if args.cmd == "sign":
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        if args.artifact:
            data = args.artifact.read_bytes()
            manifest["sha256"] = hashlib.sha256(data).hexdigest()
            manifest["size"] = len(data)
        private = args.private_key_file.read_text(encoding="utf-8").strip()
        signed = sign_manifest(manifest, private)
        out = args.out or args.manifest.with_suffix(".signed.json")
        out.write_text(json.dumps(signed, indent=2) + "\n", encoding="utf-8")
        print(out)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
