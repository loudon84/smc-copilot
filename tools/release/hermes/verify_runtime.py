"""Verify a Hermes managed offline bundle against runtime-build metadata."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

from tools.release.hermes.build_wheelhouse import assert_windows_amd64_wheel
from tools.release.hermes.source_metadata import FORBIDDEN_VERSIONS

FORBIDDEN_NAMES = {
    "python.exe",
    "node.exe",
    "npm.exe",
    ".env",
    "config.yaml",
}
FORBIDDEN_PARTS = {".git", ".github", ".venv", "node_modules", "tests"}
CHROMIUM_FORBIDDEN_DIR_NAMES = {"chromium", ".local-chromium", "chrome-win", "chrome-linux"}
FORBIDDEN_SUFFIXES = {".key", ".pfx", ".p12"}


def scan_forbidden(root: Path) -> None:
    for path in root.rglob("*"):
        parts = {part.lower() for part in path.relative_to(root).parts}
        if parts & FORBIDDEN_PARTS:
            raise ValueError(f"forbidden path in bundle: {path.relative_to(root)}")
        name = path.name.lower()
        if name in FORBIDDEN_NAMES:
            raise ValueError(f"forbidden file in bundle: {path.name}")
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            raise ValueError(f"secret suffix in bundle: {path.name}")
        if "private-key" in name or name.endswith(".key"):
            raise ValueError(f"private key in bundle: {path.name}")


def verify_bundle_tree(root: Path) -> dict[str, Any]:
    scan_forbidden(root)
    build_path = root / "runtime-build.json"
    profile_path = root / "runtime-profile.json"
    if not build_path.is_file():
        raise ValueError("runtime-build.json missing")
    if not profile_path.is_file():
        raise ValueError("runtime-profile.json missing")
    build = json.loads(build_path.read_text(encoding="utf-8"))
    if build.get("schema") != "smc.hermes.runtime-build.v1":
        raise ValueError("invalid runtime-build schema")
    version = str(build.get("version") or "")
    if version.lower() in FORBIDDEN_VERSIONS:
        raise ValueError("forbidden hermes version")
    wheels = list((root / "python" / "wheels").glob("*.whl"))
    if not wheels:
        raise ValueError("missing python dependency")
    for wheel in wheels:
        assert_windows_amd64_wheel(wheel.name)
    app_wheels = list((root / "app").glob("*.whl"))
    if not app_wheels:
        raise ValueError("hermes wheel missing")
    node_packages = list((root / "node" / "packages").glob("*.tgz"))
    expected_node = int((build.get("node") or {}).get("packageCount") or 0)
    if expected_node and len(node_packages) < expected_node:
        raise ValueError("missing node dependency")
    if build.get("source", {}).get("dirty") and build.get("liveEligible"):
        raise ValueError("dirty source cannot be liveEligible")
    return build


def verify_bundle_zip(archive: Path) -> dict[str, Any]:
    with zipfile.ZipFile(archive) as zf:
        for name in zf.namelist():
            lowered = name.replace("\\", "/").lower()
            if any(part in FORBIDDEN_PARTS for part in lowered.split("/")):
                raise ValueError(f"forbidden path in bundle: {name}")
            base = Path(name).name.lower()
            if base in FORBIDDEN_NAMES:
                raise ValueError(f"forbidden file in bundle: {name}")
    extract = archive.parent / f"{archive.stem}-verify"
    extract.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(extract)
    return verify_bundle_tree(extract)
