"""Runtime artifact envelope v3: full file list, containment, archive digest."""

from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_v2 import RELEASE_KEY_ID, SMOKE_KEY_ID, sha256_file, validate_entrypoint

MANIFEST_SCHEMA = "smc.opsi.runtime-artifact.v3"
COMPATIBLE_SCHEMAS = ("smc.opsi.runtime-artifact.v2", MANIFEST_SCHEMA)

__all__ = ["RELEASE_KEY_ID", "SMOKE_KEY_ID", "sha256_file"]


def canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
    payload = {
        "architecture": manifest["architecture"],
        "bytes": manifest["bytes"],
        "cliSha256": manifest["cliSha256"],
        "cliVersion": manifest["cliVersion"],
        "cliVersionCommand": manifest.get("cliVersionCommand", ["--version"]),
        "controllerCompat": manifest.get("controllerCompat", "1"),
        "entrypoint": manifest["entrypoint"],
        "files": manifest.get("files") or [],
        "keyId": manifest["keyId"],
        "packageRevision": manifest["packageRevision"],
        "platform": manifest["platform"],
        "schema": manifest["schema"],
        "sha256": manifest["sha256"],
        "version": manifest["version"],
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def signature_payload(manifest: dict[str, Any], artifact_digest: str) -> bytes:
    return canonical_manifest_bytes(manifest) + bytes.fromhex(artifact_digest)


def sign_envelope(manifest: dict[str, Any], artifact_digest: str, private_key) -> bytes:
    return private_key.sign(signature_payload(manifest, artifact_digest))


def file_list_from_zip(archive: Path) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/") or ":" in name:
                raise ValueError(f"archive path escapes payload: {name}")
            data = zf.read(info)
            files.append({"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    files.sort(key=lambda item: item["path"])
    return files


def verify_envelope(manifest: dict[str, Any], artifact_digest: str, signature: bytes, public_key) -> None:
    if manifest.get("sha256") != artifact_digest:
        raise ValueError("manifest sha256 does not match artifact digest")
    schema = str(manifest.get("schema") or "")
    if schema not in COMPATIBLE_SCHEMAS:
        raise ValueError(f"unsupported artifact schema: {schema}")
    validate_entrypoint(str(manifest.get("entrypoint") or ""))
    files = manifest.get("files") or []
    if schema == MANIFEST_SCHEMA and not files:
        raise ValueError("v3 manifest requires files[]")
    for item in files:
        validate_entrypoint(str(item.get("path") or ""))
        if int(item.get("size") or 0) <= 0:
            raise ValueError(f"invalid file size: {item.get('path')}")
        if len(str(item.get("sha256") or "")) != 64:
            raise ValueError(f"invalid file digest: {item.get('path')}")
    public_key.verify(signature, signature_payload(manifest, artifact_digest))


def verify_extracted_files(root: Path, files: list[dict[str, Any]]) -> None:
    present = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    expected = {str(item["path"]).replace("\\", "/") for item in files}
    extra = present - expected
    missing = expected - present
    if extra or missing:
        raise ValueError(f"extracted file list mismatch extra={sorted(extra)} missing={sorted(missing)}")
    for item in files:
        path = root / item["path"]
        if path.is_symlink():
            raise ValueError(f"symlink forbidden: {item['path']}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != str(item["sha256"]).lower():
            raise ValueError(f"extracted digest mismatch: {item['path']}")
        if path.stat().st_size != int(item["size"]):
            raise ValueError(f"extracted size mismatch: {item['path']}")
