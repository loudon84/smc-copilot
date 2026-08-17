"""Offline Node packages: only profile-declared exact versions."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from tools.release.hermes.runtime_profile import FORBIDDEN_NODE_VERSIONS


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_pinned(version: str) -> str:
    text = str(version or "").strip()
    if not text or text.lower() in FORBIDDEN_NODE_VERSIONS:
        raise ValueError(f"node package version not pinned: {version}")
    return text


def inventory_packages(packages_dir: Path) -> list[dict[str, Any]]:
    items = []
    for path in sorted(packages_dir.glob("*.tgz")):
        items.append({"filename": path.name, "sha256": sha256_file(path)})
    return items


def package_lock_digest(package_json: dict[str, Any], items: list[dict[str, Any]]) -> str:
    payload = json.dumps({"package": package_json, "files": items}, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def write_package_manifest(dest: Path, packages: list[dict[str, str]]) -> tuple[Path, Path]:
    dest.mkdir(parents=True, exist_ok=True)
    dependencies = {item["name"]: assert_pinned(item["version"]) for item in packages}
    package_json = {"name": "smc-hermes-managed-node", "private": True, "dependencies": dependencies}
    lock = {"name": "smc-hermes-managed-node", "lockfileVersion": 3, "packages": {}, "dependencies": dependencies}
    pkg_path = dest / "package.json"
    lock_path = dest / "package-lock.json"
    pkg_path.write_text(json.dumps(package_json, indent=2) + "\n", encoding="utf-8")
    lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    return pkg_path, lock_path


def pack_packages(packages: list[dict[str, str]], dest: Path) -> list[Path]:
    packages_dir = dest / "packages"
    packages_dir.mkdir(parents=True, exist_ok=True)
    npm = shutil.which("npm")
    if npm is None:
        raise ValueError("npm missing; cannot pack node packages")
    written: list[Path] = []
    for item in packages:
        name = item["name"]
        version = assert_pinned(item["version"])
        spec = f"{name}@{version}"
        result = subprocess.run(
            [npm, "pack", spec, "--pack-destination", str(packages_dir)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(result.stderr.strip() or f"npm pack failed: {spec}")
        written.extend(sorted(packages_dir.glob("*.tgz")))
    if packages and not list(packages_dir.glob("*.tgz")):
        raise ValueError("missing node dependency")
    return written


def verify_declared_packages(packages: list[dict[str, str]], packages_dir: Path) -> None:
    if not packages:
        return
    tgz = list(packages_dir.glob("*.tgz"))
    if not tgz:
        raise ValueError("missing node dependency")
    for item in packages:
        token = item["name"].lstrip("@").replace("/", "-")
        version = assert_pinned(item["version"])
        expected = f"{token}-{version}.tgz".replace("@", "")
        names = {path.name.lower() for path in tgz}
        if expected.lower() not in names and not any(token.replace("/", "-").lower() in name for name in names):
            raise ValueError(f"missing node dependency: {item['name']}@{version}")
