"""Extract an .opsi archive and fail closed on identity mismatch."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

COMPARE_PATHS = (
    "OPSI/control.toml",
    "OPSI/product-release.json",
    "CLIENT_DATA/keys/release-public-key.pem",
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _member(archive: Path, name: str) -> bytes:
    target = name.replace("\\", "/")
    with zipfile.ZipFile(archive) as zf:
        for member in zf.namelist():
            if member.replace("\\", "/") == target:
                return zf.read(member)
    raise ValueError(f"Release FAILED: missing {name}")


def readback_opsi(archive: Path, stage: Path) -> dict[str, str]:
    if not archive.is_file():
        raise ValueError("Release FAILED: .opsi missing")
    mismatches: list[str] = []
    for rel in COMPARE_PATHS:
        staged = stage / Path(rel)
        if not staged.is_file():
            mismatches.append(f"stage missing {rel}")
            continue
        packed = _member(archive, rel)
        if packed != staged.read_bytes():
            mismatches.append(rel)
    index = json.loads(_member(archive, "OPSI/product-release.json"))
    runtime = (index.get("runtimes") or [None])[0]
    if not runtime:
        mismatches.append("runtime catalog missing")
    else:
        artifacts = list((stage / "CLIENT_DATA" / "artifacts").glob("hermes-*.zip"))
        manifests = list((stage / "CLIENT_DATA" / "artifacts").glob("hermes-*.manifest.json"))
        if artifacts:
            actual = sha256_bytes(artifacts[0].read_bytes())
            if actual != runtime.get("artifactSha256"):
                mismatches.append("runtime zip sha256")
        if manifests:
            actual = sha256_bytes(manifests[0].read_bytes())
            if actual != runtime.get("manifestSha256"):
                mismatches.append("runtime manifest sha256")
            packed_manifest = json.loads(_member(archive, f"CLIENT_DATA/artifacts/{manifests[0].name}"))
            staged_manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
            if packed_manifest != staged_manifest:
                mismatches.append("runtime manifest content")
    controller = stage / "CLIENT_DATA" / "controller" / "controller.manifest.json"
    if controller.is_file():
        packed = json.loads(_member(archive, "CLIENT_DATA/controller/controller.manifest.json"))
        if packed != json.loads(controller.read_text(encoding="utf-8")):
            mismatches.append("controller manifest")
        if packed.get("canonicalDigest") != (index.get("controller") or {}).get("bundleDigest"):
            mismatches.append("controller digest")
    if mismatches:
        raise ValueError("Release FAILED: " + ", ".join(mismatches))
    return {
        "productVersion": str(index.get("productVersion") or ""),
        "packageVersion": str(index.get("packageVersion") or ""),
        "artifactSha256": sha256_bytes(archive.read_bytes()),
    }
