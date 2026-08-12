"""Load and validate infra/salt/manifest/client-manifest.json."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SCHEMA = "smc.salt-client.v1"
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")
DEFAULT_MANIFEST = Path(__file__).resolve().parents[1] / "manifest" / "client-manifest.example.json"


class ManifestError(ValueError):
    """Invalid client manifest."""


def load_manifest(path: Path | None = None) -> dict[str, Any]:
    target = path or DEFAULT_MANIFEST
    payload = json.loads(target.read_text(encoding="utf-8"))
    validate_manifest(payload)
    return payload


def validate_manifest(payload: dict[str, Any]) -> None:
    if payload.get("schema") != SCHEMA:
        raise ManifestError(f"unsupported schema: {payload.get('schema')}")
    salt = payload.get("salt") or {}
    version = str(salt.get("version") or "")
    channel = str(salt.get("channel") or "")
    installer = str(salt.get("installer") or "")
    sha256 = str(salt.get("sha256") or "")
    if not version or version.lower() == "latest":
        raise ManifestError("salt.version must be pinned (latest is forbidden)")
    if "lts" not in channel.lower():
        raise ManifestError("salt.channel must be an LTS channel (e.g. 3008-lts)")
    if not installer or "latest" in installer.lower():
        raise ManifestError("salt.installer must be a pinned MSI name")
    if not HEX64.match(sha256):
        raise ManifestError("salt.sha256 must be a 64-char hex digest")
    bootstrap = payload.get("bootstrap") or {}
    min_build = int(bootstrap.get("minWindowsBuild") or 0)
    if min_build < 22000:
        raise ManifestError("bootstrap.minWindowsBuild must be >= 22000 (Windows 11)")


def verify_installer_sha256(installer_path: Path, expected_sha256: str) -> bool:
    import hashlib

    digest = hashlib.sha256(installer_path.read_bytes()).hexdigest()
    return digest.lower() == expected_sha256.lower()
