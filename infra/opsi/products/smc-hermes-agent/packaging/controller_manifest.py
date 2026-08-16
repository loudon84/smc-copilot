"""Controller bundle manifest + TEST-ONLY signing (does not overwrite source keys)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

CONTROLLER_SCHEMA = "smc.opsi.endpoint-controller.v1"
RELEASE_KEY_ID = "smc-opsi-release-ed25519-v1"
SMOKE_KEY_ID = "TEST-ONLY-ed25519"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_entries(root: Path) -> list[dict[str, Any]]:
    files = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if ".." in rel.split("/") or rel.startswith("/") or ":" in rel:
            raise ValueError(f"controller path escapes bundle: {rel}")
        files.append({"path": rel, "size": path.stat().st_size, "sha256": sha256_file(path)})
    return files


def canonical_bytes(manifest: dict[str, Any]) -> bytes:
    payload = {
        "architecture": manifest["architecture"],
        "canonicalDigest": manifest["canonicalDigest"],
        "entrypoint": manifest["entrypoint"],
        "files": manifest["files"],
        "minProductRevision": manifest["minProductRevision"],
        "platform": manifest["platform"],
        "recoveryEntrypoint": manifest["recoveryEntrypoint"],
        "revision": manifest["revision"],
        "schema": manifest["schema"],
        "signerKeyId": manifest["signerKeyId"],
        "userEntrypoint": manifest["userEntrypoint"],
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def build_unsigned(root: Path, revision: str, *, key_id: str = RELEASE_KEY_ID) -> dict[str, Any]:
    files = file_entries(root)
    body = {
        "schema": CONTROLLER_SCHEMA,
        "revision": revision,
        "platform": "windows",
        "architecture": "amd64",
        "files": files,
        "entrypoint": "Invoke-SmcEndpointController.ps1",
        "recoveryEntrypoint": "Invoke-SmcEndpointController.ps1",
        "userEntrypoint": "Invoke-SmcUserController.ps1",
        "signerKeyId": key_id,
        "minProductRevision": "3",
        "canonicalDigest": "",
        "signature": "",
    }
    digest = hashlib.sha256(canonical_bytes({**body, "canonicalDigest": "0" * 64})).hexdigest()
    body["canonicalDigest"] = digest
    return body


def sign_manifest(manifest: dict[str, Any], private_key) -> dict[str, Any]:
    signature = private_key.sign(canonical_bytes(manifest)).hex()
    return {**manifest, "signature": signature}


def verify_manifest(manifest: dict[str, Any], public_key) -> None:
    if manifest.get("schema") != CONTROLLER_SCHEMA:
        raise ValueError("unexpected controller schema")
    if not manifest.get("files"):
        raise ValueError("controller manifest files required")
    for item in manifest["files"]:
        if ".." in str(item["path"]).split("/"):
            raise ValueError("controller file path traversal")
    public_key.verify(bytes.fromhex(str(manifest["signature"])), canonical_bytes(manifest))
