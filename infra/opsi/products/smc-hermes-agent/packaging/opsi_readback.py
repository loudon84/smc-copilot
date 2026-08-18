"""OPSI-aware extract of a product archive and fail-closed identity compare."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from control_schema import (  # noqa: E402
    ControlSchemaError,
    package_version as control_package_version,
    product_version as control_product_version,
    property_default,
    validate_control_schema,
)

COMPARE_PATHS = (
    # control.toml is intentionally excluded: opsi-makepackage rewrites it to
    # opsicommon canonical forms (LocalbootProduct / BoolProductProperty / ...).
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


def _package_root(dest: Path) -> Path:
    direct = dest / "OPSI" / "control.toml"
    if direct.is_file():
        return dest
    matches = sorted(dest.rglob("OPSI/control.toml"))
    if not matches:
        raise ValueError("Release FAILED: OPSI/control.toml missing after extract")
    return matches[0].parent.parent


def extract_opsi(archive: Path, dest: Path) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    if archive.suffix.lower() == ".opsi":
        tool = shutil.which("opsi-cli")
        if not tool:
            raise ValueError("Release FAILED: opsi-cli missing; native extract required")
        result = subprocess.run(
            [tool, "package", "extract", "-o", str(archive), str(dest)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(
                "Release FAILED: opsi-cli package extract failed: "
                + (result.stderr or result.stdout or "").strip()
            )
        return _package_root(dest)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
        return _package_root(dest)
    if tarfile.is_tarfile(archive):
        with tarfile.open(archive) as tf:
            tf.extractall(dest)
        return _package_root(dest)
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
    control_path = extracted / "OPSI" / "control.toml"
    stage_control_path = stage / "OPSI" / "control.toml"
    index_path = extracted / "OPSI" / "product-release.json"
    if not index_path.is_file():
        mismatches.append("product-release.json")
        if mismatches:
            raise ValueError("Release FAILED: " + ", ".join(mismatches))
    index = json.loads(index_path.read_text(encoding="utf-8"))
    product_version = ""
    package_version = ""
    hermes_version = ""
    controller_revision = ""
    if control_path.is_file():
        try:
            control = validate_control_schema(
                control_path,
                expected_product_version=str(index.get("productVersion") or "") or None,
                expected_package_version=str(index.get("packageVersion") or "") or None,
                # Empty optional scripts may be omitted after opsi rewrite.
                require_scripts=False,
            )
        except ControlSchemaError as exc:
            raise ValueError(str(exc)) from exc
        if not str((control.get("Product") or {}).get("setupScript") or "").strip():
            mismatches.append("setupScript")
        product_version = control_product_version(control)
        package_version = control_package_version(control)
        hermes_version = property_default(control, "hermes_version")
        controller_revision = property_default(control, "controller_revision")
        if stage_control_path.is_file():
            try:
                staged_control = validate_control_schema(stage_control_path, require_scripts=False)
            except ControlSchemaError as exc:
                raise ValueError(str(exc)) from exc
            if control_product_version(staged_control) != product_version:
                mismatches.append("control product version")
            if control_package_version(staged_control) != package_version:
                mismatches.append("control package version")
            if property_default(staged_control, "hermes_version") != hermes_version:
                mismatches.append("control hermes_version")
            if property_default(staged_control, "controller_revision") != controller_revision:
                mismatches.append("control controller_revision")
    else:
        mismatches.append("OPSI/control.toml")
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
