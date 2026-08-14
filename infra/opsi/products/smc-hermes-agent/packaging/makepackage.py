#!/usr/bin/env python3
"""Build smc-hermes-agent OPSI package (smoke zip if opsi-makepackage is absent)."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
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


def build(dest: Path) -> Path:
    product_version = _control_field("productVersion")
    package_version = _control_field("packageVersion")
    if "latest" in product_version.lower():
        raise SystemExit("productVersion must be exact")
    name = f"smc-hermes-agent_{product_version}-{package_version}.opsi"
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / name
    if archive.exists():
        archive.unlink()
    files: list[Path] = []
    for rel in ("OPSI", "CLIENT_DATA", "scripts", "bootstrap", "managed"):
        root = PRODUCT / rel
        if root.is_dir():
            files.extend([path for path in root.rglob("*") if path.is_file()])
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
    print(f"wrote {archive}")
    return archive


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
        raise SystemExit("run opsi-makepackage from an OPSI Linux builder; this smoke path is for CI")
    archive = build(args.dest)
    if archive.stat().st_size < 100:
        raise SystemExit("package too small")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
