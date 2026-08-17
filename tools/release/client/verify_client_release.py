"""Final verification for a client release tree."""

from __future__ import annotations

import json
from pathlib import Path

from tools.release.client.release_inventory import scan_secrets, sha256_file

REQUIRED_FILES = (
    "manifests/client-release.json",
    "manifests/SHA256SUMS",
)


def verify_client_release(root: Path) -> dict:
    scan_secrets(root)
    missing = [rel for rel in REQUIRED_FILES if not (root / rel).is_file()]
    if missing:
        raise ValueError(f"client release incomplete: {missing}")
    manifest = json.loads((root / "manifests" / "client-release.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "smc.client-release.v1":
        raise ValueError("invalid client-release schema")
    work_dir = root / "work"
    hermes_dir = root / "hermes"
    opsi_dir = root / "opsi"
    bootstrap = root / "bootstrap"
    if not any(work_dir.glob("copilot-desktop-*-setup.exe")):
        raise ValueError("Work setup installer missing")
    if not any(hermes_dir.glob("hermes-*.zip")):
        raise ValueError("Hermes artifact missing")
    if not any(opsi_dir.glob("*.opsi")):
        raise ValueError("OPSI product missing")
    if not any(bootstrap.glob("opsi-client-agent-installer.exe")):
        raise ValueError("OPSI client installer missing")
    hermes_zip = next(hermes_dir.glob("hermes-*.zip"))
    if sha256_file(hermes_zip) != manifest["hermes"]["artifactSha256"]:
        raise ValueError("Hermes artifact hash mismatch")
    opsi_pkg = next(opsi_dir.glob("*.opsi"))
    if sha256_file(opsi_pkg) != manifest["opsi"]["artifactSha256"]:
        raise ValueError("OPSI artifact hash mismatch")
    installer = next(bootstrap.glob("opsi-client-agent-installer.exe"))
    if sha256_file(installer) != manifest["opsiClientAgent"]["sha256"]:
        raise ValueError("OPSI client installer hash mismatch")
    if manifest.get("liveEligible") and any("private" in p.name.lower() and "public" not in p.name.lower() for p in root.rglob("*")):
        raise ValueError("private material cannot be liveEligible")
    return manifest
