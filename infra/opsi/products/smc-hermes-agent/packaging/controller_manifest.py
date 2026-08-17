"""Controller bundle manifest + TEST-ONLY signing (does not overwrite source keys)."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

CONTROLLER_SCHEMA = "smc.opsi.endpoint-controller.v1"
RELEASE_KEY_ID = "smc-opsi-release-ed25519-v1"
SMOKE_KEY_ID = "TEST-ONLY-ed25519"
REQUIRED_ENTRYPOINTS = ("entrypoint", "recoveryEntrypoint", "userEntrypoint")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_safe_rel(rel: str) -> str:
    text = rel.replace("\\", "/")
    if not text or text.startswith("/") or ".." in text.split("/") or re.match(r"^[a-zA-Z]:", text):
        raise ValueError(f"controller path escapes bundle: {rel}")
    if text.startswith("//") or ":" in text.split("/")[0]:
        raise ValueError(f"controller path escapes bundle: {rel}")
    return text


def file_entries(root: Path) -> list[dict[str, Any]]:
    files = []
    seen: set[str] = set()
    fold: set[str] = set()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.is_symlink():
            raise ValueError(f"symlink forbidden: {path}")
        rel = assert_safe_rel(path.relative_to(root).as_posix())
        key = rel.lower()
        if rel in seen:
            raise ValueError(f"duplicate controller path: {rel}")
        if key in fold:
            raise ValueError(f"case-fold collision: {rel}")
        seen.add(rel)
        fold.add(key)
        size = path.stat().st_size
        if size <= 0:
            raise ValueError(f"empty controller file forbidden: {rel}")
        files.append({"path": rel, "size": size, "sha256": sha256_file(path)})
    return files


def _unsigned_payload(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "architecture": manifest["architecture"],
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


def canonical_bytes(manifest: dict[str, Any]) -> bytes:
    return json.dumps(_unsigned_payload(manifest), separators=(",", ":"), sort_keys=True).encode("utf-8")


def compute_canonical_digest(manifest: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_bytes(manifest)).hexdigest()


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
        "minProductRevision": "1",
        "canonicalDigest": "",
        "signature": "",
    }
    body["canonicalDigest"] = compute_canonical_digest(body)
    return body


def sign_manifest(manifest: dict[str, Any], private_key) -> dict[str, Any]:
    signature = private_key.sign(canonical_bytes(manifest)).hex()
    return {**manifest, "signature": signature}


def verify_manifest(manifest: dict[str, Any], public_key, bundle_root: Path | None = None) -> None:
    if manifest.get("schema") != CONTROLLER_SCHEMA:
        raise ValueError("unexpected controller schema")
    if not manifest.get("signature"):
        raise ValueError("controller signature required")
    if not manifest.get("files"):
        raise ValueError("controller manifest files required")
    recomputed = compute_canonical_digest(manifest)
    if recomputed != str(manifest.get("canonicalDigest") or ""):
        raise ValueError("controller canonicalDigest mismatch")
    for field in REQUIRED_ENTRYPOINTS:
        name = str(manifest.get(field) or "")
        assert_safe_rel(name)
        if not any(item["path"] == name for item in manifest["files"]):
            raise ValueError(f"controller {field} missing from files")
    seen: set[str] = set()
    fold: set[str] = set()
    for item in manifest["files"]:
        rel = assert_safe_rel(str(item["path"]))
        key = rel.lower()
        if rel in seen or key in fold:
            raise ValueError(f"duplicate controller path: {rel}")
        seen.add(rel)
        fold.add(key)
        if int(item.get("size") or 0) <= 0:
            raise ValueError(f"invalid controller file size: {rel}")
    public_key.verify(bytes.fromhex(str(manifest["signature"])), canonical_bytes(manifest))
    if bundle_root is not None:
        verify_bundle_files(bundle_root, manifest["files"])


def verify_bundle_files(root: Path, files: list[dict[str, Any]]) -> None:
    present = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p.name != "controller.manifest.json"}
    expected = {str(item["path"]).replace("\\", "/") for item in files}
    extra = present - expected
    missing = expected - present
    if extra or missing:
        raise ValueError(f"controller file list mismatch extra={sorted(extra)} missing={sorted(missing)}")
    for item in files:
        path = root / item["path"]
        if path.is_symlink():
            raise ValueError(f"symlink forbidden: {item['path']}")
        if sha256_file(path) != str(item["sha256"]).lower():
            raise ValueError(f"controller file digest mismatch: {item['path']}")
        if path.stat().st_size != int(item["size"]):
            raise ValueError(f"controller file size mismatch: {item['path']}")
