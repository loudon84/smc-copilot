"""Signed Hermes artifact lifecycle. Does not import services.runtime."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from .paths import HermesLayout
from .semver import semver_key


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hmac_signature(data: bytes, key: str) -> str:
    return hmac.new(key.encode("utf-8"), data, hashlib.sha256).hexdigest()


def verify_signature(data: bytes, signature: str, key: str) -> bool:
    expected = hmac_signature(data, key)
    return hmac.compare_digest(expected, signature.lower())


def verify_bundle(archive: Path, sha256: str, signature: str, signing_key: str) -> dict[str, Any]:
    data = archive.read_bytes()
    digest = sha256_bytes(data)
    if digest.lower() != sha256.lower():
        return {"ok": False, "error": "checksum_mismatch", "actual": digest, "expected": sha256}
    if not verify_signature(data, signature, signing_key):
        return {"ok": False, "error": "signature_invalid"}
    return {"ok": True, "sha256": digest}


def download_artifact(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if url.startswith("file://"):
        src = Path(urllib.request.url2pathname(url[7:]))
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest
    if "://" not in url:
        src = Path(url)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest
    urllib.request.urlretrieve(url, dest)  # noqa: S310 — caller supplies trusted artifact mirror
    return dest


def _find_agent_root(staging: Path) -> Path:
    direct = staging / "hermes-agent"
    if direct.is_dir():
        return direct
    for child in staging.iterdir():
        if child.is_dir() and (child / "hermes_cli").is_dir():
            return child
        nested = child / "hermes-agent"
        if nested.is_dir():
            return nested
    return staging


def unpack_zip(archive: Path, staging: Path) -> Path:
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(staging)
    return _find_agent_root(staging)


def _ensure_isolated_venv(agent_root: Path) -> None:
    """Create a stub isolated venv layout when the bundle does not ship one."""
    layout = HermesLayout.from_home(agent_root.parent if agent_root.name == "hermes-agent" else agent_root)
    # Prefer in-tree venv next to hermes_cli.
    scripts = agent_root / "venv" / ("Scripts" if os.name == "nt" else "bin")
    scripts.mkdir(parents=True, exist_ok=True)
    python = scripts / ("python.exe" if os.name == "nt" else "python")
    hermes = scripts / ("hermes.exe" if os.name == "nt" else "hermes")
    if not python.exists():
        python.write_text("", encoding="utf-8")
    if not hermes.exists():
        hermes.write_text("", encoding="utf-8")
    del layout


def activate_version(home: Path, version: str, agent_root: Path) -> dict[str, Any]:
    home.mkdir(parents=True, exist_ok=True)
    versions = home / "versions" / version / "hermes-agent"
    versions.parent.mkdir(parents=True, exist_ok=True)
    source = Path(agent_root)
    if source.resolve() != versions.resolve():
        if versions.exists():
            shutil.rmtree(versions)
        shutil.copytree(source, versions)
    _ensure_isolated_venv(versions)
    target = home / "hermes-agent"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(versions, target)
    layout = HermesLayout.from_home(home)
    if not layout.hermes_exe.exists() and not (layout.repo / "hermes_cli" / "main.py").exists():
        return {"ok": False, "error": "executable_missing", "home": str(home)}
    active = {
        "version": version,
        "channel": "signed",
        "python": str(layout.python),
        "activated_at": int(time.time()),
        "semver": list(semver_key(version)),
    }
    (home / "active.json").write_text(json.dumps(active, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "version": version, "home": str(home), "active": active, "installed": layout.is_installed()}


def install_signed(
    *,
    version: str,
    url: str,
    sha256: str,
    signature: str,
    signing_key: str,
    hermes_home: str | Path,
) -> dict[str, Any]:
    if not version or version.lower() == "latest":
        return {"ok": False, "error": "version_unpinned"}
    if not signing_key:
        return {"ok": False, "error": "signing_key_missing"}
    home = Path(hermes_home).expanduser()
    staging_root = Path(tempfile.mkdtemp(prefix="smc-hermes-artifact-"))
    try:
        archive = staging_root / "bundle.zip"
        download_artifact(url, archive)
        verified = verify_bundle(archive, sha256, signature, signing_key)
        if not verified.get("ok"):
            return verified
        agent_root = unpack_zip(archive, staging_root / "unpacked")
        return activate_version(home, version, agent_root)
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)
