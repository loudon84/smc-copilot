#!/usr/bin/env python3
"""Build smc-hermes-agent package.

Smoke path writes a .smoke.zip (never .opsi). Real .opsi comes from opsi-makepackage
on an OPSI Linux builder — see packaging/linux-builder.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path

PRODUCT = Path(__file__).resolve().parents[1]
REPO_OPSI = Path(__file__).resolve().parents[3]


def _control_field(name: str) -> str:
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    match = re.search(rf'^{name}\s*=\s*"([^"]+)"', text, re.M)
    if not match:
        raise SystemExit(f"missing {name} in control.toml")
    return match.group(1)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _ensure_smoke_artifact(product_version: str, package_version: str) -> None:
    artifacts = PRODUCT / "CLIENT_DATA" / "artifacts"
    keys = PRODUCT / "CLIENT_DATA" / "keys"
    artifacts.mkdir(parents=True, exist_ok=True)
    keys.mkdir(parents=True, exist_ok=True)
    zip_path = artifacts / f"hermes-{product_version}-windows.zip"
    if not zip_path.exists():
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("README.txt", f"smoke hermes payload {product_version}\n")
    digest = _sha256(zip_path)
    manifest = {
        "version": product_version,
        "platform": "windows",
        "architecture": "amd64",
        "bytes": zip_path.stat().st_size,
        "sha256": digest,
        "packageRevision": package_version,
        "createdAt": datetime.now(UTC).isoformat(),
    }
    man_path = artifacts / f"hermes-{product_version}-windows.manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    sig_path = artifacts / f"hermes-{product_version}-windows.sig"
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        key_path = Path.cwd() / "dist" / "release-private-key.pem"
        pub_path = keys / "release-public-key.pem"
        key_path.parent.mkdir(parents=True, exist_ok=True)
        # redaction: never pack or log the private key
        if key_path.exists():
            private = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
        else:
            private = Ed25519PrivateKey.generate()
            key_path.write_bytes(
                private.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                )
            )
        pub_path.write_bytes(
            private.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8") + bytes.fromhex(digest)
        sig_path.write_bytes(private.sign(payload))
    except Exception:
        pub = keys / "release-public-key.pem"
        if not pub.exists():
            pub.write_text("-----BEGIN PUBLIC KEY-----\nSMOKE-ONLY\n-----END PUBLIC KEY-----\n", encoding="utf-8")
        sig_path.write_bytes(bytes.fromhex(digest) * 2)


def _collect_files() -> list[Path]:
    files: list[Path] = []
    for rel in ("OPSI", "CLIENT_DATA", "scripts", "bootstrap", "managed"):
        root = PRODUCT / rel
        if root.is_dir():
            files.extend([path for path in root.rglob("*") if path.is_file()])
    return [path for path in files if "release-private-key.pem" not in path.name]


def _write_archive(archive: Path, product_version: str, package_version: str) -> None:
    if archive.exists():
        archive.unlink()
    files = _collect_files()
    manifest = []
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            rel = path.relative_to(PRODUCT)
            parts = rel.parts
            if parts[0] in {"scripts", "bootstrap", "managed"}:
                arc = "CLIENT_DATA/" + str(rel).replace("\\", "/")
            else:
                arc = str(rel).replace("\\", "/")
            zf.write(path, arcname=arc)
            manifest.append({"path": arc, "sha256": _sha256(path), "bytes": path.stat().st_size})
        zf.writestr(
            "OPSI/smc-artifact-manifest.json",
            json.dumps(
                {
                    "productId": "smc-hermes-agent",
                    "productVersion": product_version,
                    "packageVersion": package_version,
                    "platform": "windows",
                    "files": manifest,
                },
                indent=2,
            )
            + "\n",
        )


def build_smoke(dest: Path) -> Path:
    product_version = _control_field("productVersion")
    package_version = _control_field("packageVersion")
    if "latest" in product_version.lower():
        raise SystemExit("productVersion must be exact")
    _ensure_smoke_artifact(product_version, package_version)
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / f"smc-hermes-agent_{product_version}-{package_version}.smoke.zip"
    _write_archive(archive, product_version, package_version)
    print(f"wrote {archive}")
    return archive


def build(dest: Path) -> Path:
    """Deprecated alias: smoke only. Real .opsi is produced by opsi-makepackage."""
    return build_smoke(dest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--dest", type=Path, default=PRODUCT / "dist")
    parser.add_argument("--production-depot", action="store_true", help="forbidden unless operator override")
    args = parser.parse_args()
    if args.production_depot:
        raise SystemExit("refusing to publish to production depot from this script")
    opsi_bin = shutil.which("opsi-makepackage")
    if opsi_bin and not args.smoke:
        raise SystemExit("run opsi-makepackage from an OPSI Linux builder; this Python path is smoke-only")
    archive = build_smoke(args.dest)
    if archive.stat().st_size < 100:
        raise SystemExit("package too small")
    if archive.name.endswith(".opsi"):
        raise SystemExit("smoke path must not emit .opsi")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
