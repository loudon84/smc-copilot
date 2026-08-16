from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

MANIFEST_SCHEMA = "smc.opsi.runtime-artifact.v2"
RELEASE_KEY_ID = "smc-opsi-release-ed25519-v1"
SMOKE_KEY_ID = "TEST-ONLY-ed25519"


def canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
    payload = {
        "schema": manifest["schema"],
        "version": manifest["version"],
        "platform": manifest["platform"],
        "architecture": manifest["architecture"],
        "entrypoint": manifest["entrypoint"],
        "sha256": manifest["sha256"],
        "cliSha256": manifest["cliSha256"],
        "cliVersion": manifest["cliVersion"],
        "packageRevision": manifest["packageRevision"],
        "keyId": manifest["keyId"],
        "bytes": manifest["bytes"],
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def signature_payload(manifest: dict[str, Any], artifact_digest: str) -> bytes:
    return canonical_manifest_bytes(manifest) + bytes.fromhex(artifact_digest)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def validate_entrypoint(entrypoint: str) -> None:
    lowered = entrypoint.replace("/", "\\")
    if lowered.startswith("\\") or ":" in lowered or ".." in lowered.split("\\"):
        raise ValueError("entrypoint must be a relative path inside versions/current")
    if lowered.startswith("\\\\") or entrypoint.startswith("//"):
        raise ValueError("entrypoint must not be UNC")


def sign_envelope(manifest: dict[str, Any], artifact_digest: str, private_key) -> bytes:
    return private_key.sign(signature_payload(manifest, artifact_digest))


def verify_envelope(manifest: dict[str, Any], artifact_digest: str, signature: bytes, public_key) -> None:
    if manifest.get("sha256") != artifact_digest:
        raise ValueError("manifest sha256 does not match artifact digest")
    validate_entrypoint(str(manifest.get("entrypoint") or ""))
    public_key.verify(signature, signature_payload(manifest, artifact_digest))
