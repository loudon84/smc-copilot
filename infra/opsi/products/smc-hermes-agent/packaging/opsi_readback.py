"""OPSI-aware extract of a product archive and fail-closed identity compare."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

COMPARE_PATHS = (
    "OPSI/control.toml",
    "OPSI/product-release.json",
    "OPSI/smc-artifact-manifest.json",
    "CLIENT_DATA/keys/release-public-key.pem",
    "CLIENT_DATA/controller/controller.manifest.json",
)

RUNTIME_GLOBS = (
    "CLIENT_DATA/artifacts/hermes-*.zip",
    "CLIENT_DATA/artifacts/hermes-*.manifest.json",
    "CLIENT_DATA/artifacts/hermes-*.sig",
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _control_field(text: str, name: str) -> str:
    match = re.search(rf'^{name}\s*=\s*"([^"]+)"', text, re.M)
    if not match:
        raise ValueError(f"Release FAILED: missing {name} in control.toml")
    return match.group(1)


def _control_property_default(text: str, name: str) -> str:
    block = re.search(rf"\[ProductProperty\.unicode\.{re.escape(name)}\](.*?)(\n\[|\Z)", text, re.S)
    if not block:
        raise ValueError(f"Release FAILED: missing ProductProperty {name}")
    match = re.search(r'default\s*=\s*\["([^"]*)"\]', block.group(1))
    if not match:
        raise ValueError(f"Release FAILED: missing default for {name}")
    return match.group(1)


def extract_opsi(archive: Path, dest: Path) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
        return dest
    if tarfile.is_tarfile(archive):
        with tarfile.open(archive) as tf:
            tf.extractall(dest)
        return dest
    tool = shutil.which("opsi-package-manager")
    if tool:
        result = subprocess.run(
            [tool, "-x", str(archive), "-d", str(dest)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 and any(dest.rglob("control.toml")):
            return dest
    raise ValueError("Release FAILED: OPSI-aware extract failed")


def _first_match(root: Path, pattern: str) -> Path | None:
    matches = sorted(root.glob(pattern))
    return matches[0] if matches else None


def readback_opsi(archive: Path, stage: Path, *, extract_root: Path | None = None) -> dict[str, str]:
    if not archive.is_file():
        raise ValueError("Release FAILED: .opsi missing")
    readback = extract_root or (archive.parent / "readback")
    extracted = extract_opsi(archive, readback)
    mismatches: list[str] = []
    for rel in COMPARE_PATHS:
        staged = stage / Path(rel)
        packed = extracted / Path(rel)
        if not staged.is_file():
            mismatches.append(f"stage missing {rel}")
            continue
        if not packed.is_file():
            mismatches.append(f"package missing {rel}")
            continue
        if packed.read_bytes() != staged.read_bytes():
            mismatches.append(rel)
    for pattern in RUNTIME_GLOBS:
        staged_file = _first_match(stage, pattern)
        packed_file = _first_match(extracted, pattern)
        if staged_file is None or packed_file is None:
            mismatches.append(f"missing {pattern}")
            continue
        if sha256_file(staged_file) != sha256_file(packed_file):
            mismatches.append(pattern)
    control_text = (extracted / "OPSI" / "control.toml").read_text(encoding="utf-8") if (extracted / "OPSI" / "control.toml").is_file() else ""
    index_path = extracted / "OPSI" / "product-release.json"
    if not index_path.is_file():
        mismatches.append("product-release.json")
        if mismatches:
            raise ValueError("Release FAILED: " + ", ".join(mismatches))
    index = json.loads(index_path.read_text(encoding="utf-8"))
    product_version = _control_field(control_text, "productVersion") if control_text else ""
    package_version = _control_field(control_text, "packageVersion") if control_text else ""
    hermes_version = _control_property_default(control_text, "hermes_version") if control_text else ""
    controller_revision = _control_property_default(control_text, "controller_revision") if control_text else ""
    runtime = (index.get("runtimes") or [None])[0]
    if not runtime:
        mismatches.append("runtime catalog missing")
    else:
        if str(index.get("productVersion") or "") != product_version:
            mismatches.append("productVersion")
        if str(index.get("packageVersion") or "") != package_version:
            mismatches.append("packageVersion")
        if str(runtime.get("version") or "") != hermes_version:
            mismatches.append("hermes_version")
        if str((index.get("controller") or {}).get("revision") or "") != controller_revision:
            mismatches.append("controller_revision")
        runtime_zip = _first_match(extracted, "CLIENT_DATA/artifacts/hermes-*.zip")
        runtime_manifest = _first_match(extracted, "CLIENT_DATA/artifacts/hermes-*.manifest.json")
        if runtime_zip and sha256_file(runtime_zip) != runtime.get("artifactSha256"):
            mismatches.append("runtime zip sha256")
        if runtime_manifest and sha256_file(runtime_manifest) != runtime.get("manifestSha256"):
            mismatches.append("runtime manifest sha256")
        if runtime_manifest:
            packed_manifest = json.loads(runtime_manifest.read_text(encoding="utf-8"))
            if packed_manifest.get("version") != hermes_version:
                mismatches.append("runtime manifest hermes version")
    controller = extracted / "CLIENT_DATA" / "controller" / "controller.manifest.json"
    if controller.is_file():
        packed = json.loads(controller.read_text(encoding="utf-8"))
        if packed.get("canonicalDigest") != (index.get("controller") or {}).get("bundleDigest"):
            mismatches.append("controller digest")
        if packed.get("revision") != controller_revision:
            mismatches.append("controller revision")
    if mismatches:
        raise ValueError("Release FAILED: " + ", ".join(mismatches))
    return {
        "productVersion": str(index.get("productVersion") or ""),
        "packageVersion": str(index.get("packageVersion") or ""),
        "hermesVersion": hermes_version,
        "controllerRevision": controller_revision,
        "artifactSha256": sha256_file(archive),
        "readback": str(extracted),
    }
