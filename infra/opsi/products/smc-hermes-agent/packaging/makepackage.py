#!/usr/bin/env python3
"""Build smc-hermes-agent package.

Smoke path writes a .smoke.zip (never .opsi) into --dest and must not mutate
CLIENT_DATA/artifacts or source release keys. Real .opsi comes from
opsi-makepackage on an OPSI Linux builder — see packaging/linux-builder.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_v2 import (  # noqa: E402
    RELEASE_KEY_ID,
    SMOKE_KEY_ID,
    sha256_file,
    validate_entrypoint,
)
from artifact_v3 import (  # noqa: E402
    MANIFEST_SCHEMA,
    canonical_manifest_bytes,
    file_list_from_zip,
    sign_envelope,
)

PRODUCT = Path(__file__).resolve().parents[1]


def _control_field(name: str) -> str:
    text = (PRODUCT / "OPSI" / "control.toml").read_text(encoding="utf-8")
    match = re.search(rf'^{name}\s*=\s*"([^"]+)"', text, re.M)
    if not match:
        raise SystemExit(f"missing {name} in control.toml")
    return match.group(1)


def _write_cli_zip(path: Path, version: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("hermes.exe", f"SMOKE-HERMES-CLI {version}\n".encode("utf-8"))
        zf.writestr("README.txt", f"smoke hermes contract fixture {version}\n")


def _sign_smoke(manifest: dict, artifact: Path, dest_keys: Path) -> None:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    dest_keys.mkdir(parents=True, exist_ok=True)
    private = Ed25519PrivateKey.generate()
    pub_path = dest_keys / "smoke-public-key.pem"
    pub_path.write_bytes(
        private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    digest = sha256_file(artifact)
    sig_path = artifact.with_suffix(artifact.suffix + ".sig")
    if artifact.name.endswith(".zip"):
        sig_path = artifact.parent / (artifact.name[: -len(".zip")] + ".sig")
    sig_path.write_bytes(sign_envelope(manifest, digest, private))
    man_path = artifact.parent / (artifact.name.replace(".zip", ".manifest.json"))
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _ensure_smoke_artifact(dest: Path, product_version: str, package_version: str) -> Path:
    artifacts = dest / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    zip_path = artifacts / f"hermes-{product_version}-windows.zip"
    _write_cli_zip(zip_path, product_version)
    digest = sha256_file(zip_path)
    inner = hashlib_cli(zip_path)
    files = file_list_from_zip(zip_path)
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "version": product_version,
        "platform": "windows",
        "architecture": "amd64",
        "entrypoint": "hermes.exe",
        "sha256": digest,
        "cliSha256": inner,
        "cliVersion": product_version,
        "cliVersionCommand": ["--version"],
        "controllerCompat": "1",
        "packageRevision": package_version,
        "keyId": SMOKE_KEY_ID,
        "bytes": zip_path.stat().st_size,
        "files": files,
        "createdAt": datetime.now(UTC).isoformat(),
    }
    validate_entrypoint(manifest["entrypoint"])
    canonical_manifest_bytes(manifest)
    _sign_smoke(manifest, zip_path, dest / "keys")
    return zip_path


def hashlib_cli(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        data = zf.read("hermes.exe")
    return hashlib.sha256(data).hexdigest()


def _collect_files(*, skip_artifacts: bool = False) -> list[Path]:
    files: list[Path] = []
    for rel in ("OPSI", "CLIENT_DATA", "scripts", "bootstrap", "managed", "controller"):
        root = PRODUCT / rel
        if root.is_dir():
            files.extend([path for path in root.rglob("*") if path.is_file()])
    out = []
    for path in files:
        if "release-private-key.pem" in path.name or "smoke-private" in path.name:
            continue
        rel = path.relative_to(PRODUCT)
        if skip_artifacts and rel.parts[:2] == ("CLIENT_DATA", "artifacts"):
            continue
        if skip_artifacts and rel.parts[:2] == ("CLIENT_DATA", "keys"):
            continue
        out.append(path)
    return out


def _write_archive(archive: Path, product_version: str, package_version: str, extra_root: Path | None = None) -> None:
    if archive.exists():
        archive.unlink()
    files = _collect_files(skip_artifacts=extra_root is not None)
    manifest = []
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            rel = path.relative_to(PRODUCT)
            parts = rel.parts
            if parts[0] in {"scripts", "bootstrap", "managed", "controller"}:
                arc = "CLIENT_DATA/" + str(rel).replace("\\", "/")
            else:
                arc = str(rel).replace("\\", "/")
            zf.write(path, arcname=arc)
            manifest.append({"path": arc, "sha256": sha256_file(path), "bytes": path.stat().st_size})
        if extra_root:
            for path in extra_root.rglob("*"):
                if path.is_file():
                    arc = "CLIENT_DATA/" + str(path.relative_to(extra_root)).replace("\\", "/")
                    zf.write(path, arcname=arc)
                    manifest.append({"path": arc, "sha256": sha256_file(path), "bytes": path.stat().st_size})
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
    source_pub = PRODUCT / "CLIENT_DATA" / "keys" / "release-public-key.pem"
    before = source_pub.read_bytes() if source_pub.exists() else None
    work = dest / "smoke-tree"
    if work.exists():
        shutil.rmtree(work)
    _ensure_smoke_artifact(work, product_version, package_version)
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / f"smc-hermes-agent_{product_version}-{package_version}.smoke.zip"
    _write_archive(archive, product_version, package_version, extra_root=work)
    after = source_pub.read_bytes() if source_pub.exists() else None
    if before != after:
        raise SystemExit("smoke must not rewrite source release public key")
    print(f"wrote {archive}")
    return archive


def build_release(dest: Path, hermes_zip: Path, key_ref: Path) -> None:
    if not hermes_zip.is_file():
        raise SystemExit("real Hermes Windows zip required")
    if not key_ref.is_file():
        raise SystemExit("release signing key ref missing; refusing to autogenerate")
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(hermes_zip, dest / hermes_zip.name)
    print("release inputs accepted; run opsi-makepackage on the Linux builder")


def build(dest: Path) -> Path:
    return build_smoke(dest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--dest", type=Path, default=PRODUCT / "dist")
    parser.add_argument("--hermes-zip", type=Path)
    parser.add_argument("--signing-key-ref", type=Path)
    parser.add_argument("--production-depot", action="store_true", help="forbidden unless operator override")
    args = parser.parse_args()
    if args.production_depot:
        raise SystemExit("refusing to publish to production depot from this script")
    opsi_bin = shutil.which("opsi-makepackage")
    if opsi_bin and not args.smoke and args.hermes_zip:
        raise SystemExit("run opsi-makepackage from an OPSI Linux builder after staging the signed envelope")
    if args.hermes_zip:
        if not args.signing_key_ref:
            raise SystemExit("release path requires --signing-key-ref")
        build_release(args.dest, args.hermes_zip, args.signing_key_ref)
        return 0
    archive = build_smoke(args.dest)
    if archive.stat().st_size < 100:
        raise SystemExit("package too small")
    if archive.name.endswith(".opsi"):
        raise SystemExit("smoke path must not emit .opsi")
    if SMOKE_KEY_ID == RELEASE_KEY_ID:
        raise SystemExit("smoke key id must not equal release key id")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
