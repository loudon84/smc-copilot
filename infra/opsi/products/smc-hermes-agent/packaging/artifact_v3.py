"""Runtime artifact envelope v3: full file list, containment, archive digest."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_v2 import RELEASE_KEY_ID, SMOKE_KEY_ID, sha256_file, validate_entrypoint

MANIFEST_SCHEMA = "smc.opsi.runtime-artifact.v3"
COMPATIBLE_SCHEMAS = ("smc.opsi.runtime-artifact.v2", MANIFEST_SCHEMA)
MAX_FILES = 4096
MAX_UNCOMPRESSED = 512 * 1024 * 1024
COMPAT_RE = re.compile(r"^(>=|<=|>|<|=)?\d+$")

__all__ = ["RELEASE_KEY_ID", "SMOKE_KEY_ID", "sha256_file"]


INSTALL_TYPES = ("binary-zip", "python-wheelhouse")
RUNTIME_ENTRY_RE = re.compile(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")


def validate_runtime_entrypoint(value: str) -> str:
    text = str(value or "").replace("\\", "/")
    if not RUNTIME_ENTRY_RE.match(text):
        raise ValueError(f"invalid runtimeEntrypoint: {value}")
    validate_entrypoint(text.split("/")[-1])
    return text


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
    if manifest.get("installType"):
        payload["installType"] = manifest["installType"]
    if manifest.get("runtimeEntrypoint"):
        payload["runtimeEntrypoint"] = manifest["runtimeEntrypoint"]
    if manifest.get("requires"):
        payload["requires"] = manifest["requires"]
    if manifest.get("profile"):
        payload["profile"] = manifest["profile"]
    if manifest.get("runtimeBuildSha256"):
        payload["runtimeBuildSha256"] = manifest["runtimeBuildSha256"]
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def signature_payload(manifest: dict[str, Any], artifact_digest: str) -> bytes:
    return canonical_manifest_bytes(manifest) + bytes.fromhex(artifact_digest)


def sign_envelope(manifest: dict[str, Any], artifact_digest: str, private_key) -> bytes:
    return private_key.sign(signature_payload(manifest, artifact_digest))


def normalize_zip_path(name: str) -> str:
    text = name.replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    return text.lstrip("/")


def assert_safe_member_path(name: str) -> str:
    raw = name.replace("\\", "/")
    if ".." in raw.split("/"):
        raise ValueError(f"archive path escapes payload: {name}")
    text = normalize_zip_path(name)
    if not text or text.endswith("/"):
        raise ValueError(f"archive path empty: {name}")
    lowered = text.lower()
    if text.startswith("/") or text.startswith("\\") or lowered.startswith("//"):
        raise ValueError(f"archive path escapes payload: {name}")
    if re.match(r"^[a-zA-Z]:", text) or ":" in text.split("/")[0]:
        raise ValueError(f"archive path escapes payload: {name}")
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if ".." in parts:
        raise ValueError(f"archive path escapes payload: {name}")
    if any(part.endswith(".lnk") or part.lower().endswith(".reparse") for part in parts):
        raise ValueError(f"reparse/link member forbidden: {name}")
    return "/".join(parts)


def parse_compat(expr: str) -> tuple[str, int]:
    text = str(expr or "").strip()
    if not COMPAT_RE.match(text):
        raise ValueError(f"invalid controllerCompat: {expr}")
    if text[0] in "><=":
        if text.startswith(">=") or text.startswith("<="):
            return text[:2], int(text[2:])
        return text[0], int(text[1:])
    return "=", int(text)


def compat_holds(expr: str, controller_revision: str) -> bool:
    op, bound = parse_compat(expr)
    actual = int(str(controller_revision).strip())
    if op == ">=":
        return actual >= bound
    if op == "<=":
        return actual <= bound
    if op == ">":
        return actual > bound
    if op == "<":
        return actual < bound
    return actual == bound


def file_list_from_zip(archive: Path) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    seen: set[str] = set()
    fold: set[str] = set()
    total = 0
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            if info.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError(f"symlink forbidden: {info.filename}")
            name = assert_safe_member_path(info.filename)
            key = name.lower()
            if name in seen:
                raise ValueError(f"duplicate normalized path: {name}")
            if key in fold:
                raise ValueError(f"case-fold collision: {name}")
            seen.add(name)
            fold.add(key)
            data = zf.read(info)
            total += len(data)
            if len(files) + 1 > MAX_FILES:
                raise ValueError("zip file count exceeds limit")
            if total > MAX_UNCOMPRESSED:
                raise ValueError("zip uncompressed size exceeds limit")
            files.append({"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    files.sort(key=lambda item: item["path"])
    return files


def verify_envelope(manifest: dict[str, Any], artifact_digest: str, signature: bytes, public_key) -> None:
    if manifest.get("sha256") != artifact_digest:
        raise ValueError("manifest sha256 does not match artifact digest")
    schema = str(manifest.get("schema") or "")
    if schema not in COMPATIBLE_SCHEMAS:
        raise ValueError(f"unsupported artifact schema: {schema}")
    if str(manifest.get("version") or "").lower() == "latest":
        raise ValueError("latest is forbidden")
    validate_entrypoint(str(manifest.get("entrypoint") or ""))
    parse_compat(str(manifest.get("controllerCompat") or "1"))
    install_type = str(manifest.get("installType") or "binary-zip")
    if install_type not in INSTALL_TYPES:
        raise ValueError(f"unsupported installType: {install_type}")
    if install_type == "python-wheelhouse":
        if not manifest.get("runtimeEntrypoint"):
            raise ValueError("python-wheelhouse requires runtimeEntrypoint")
        validate_runtime_entrypoint(str(manifest["runtimeEntrypoint"]))
        requires = manifest.get("requires") or {}
        if not requires.get("python") or not requires.get("node"):
            raise ValueError("python-wheelhouse requires python/node ranges")
        profile = manifest.get("profile") or {}
        if not profile.get("name") or int(profile.get("version") or 0) < 1:
            raise ValueError("python-wheelhouse requires profile")
        if not manifest.get("runtimeBuildSha256"):
            raise ValueError("python-wheelhouse requires runtimeBuildSha256")
    elif manifest.get("runtimeEntrypoint"):
        validate_runtime_entrypoint(str(manifest["runtimeEntrypoint"]))
    files = manifest.get("files") or []
    if schema == MANIFEST_SCHEMA and not files:
        raise ValueError("v3 manifest requires files[]")
    seen: set[str] = set()
    fold: set[str] = set()
    for item in files:
        path = assert_safe_member_path(str(item.get("path") or ""))
        key = path.lower()
        if path in seen:
            raise ValueError(f"duplicate normalized path: {path}")
        if key in fold:
            raise ValueError(f"case-fold collision: {path}")
        seen.add(path)
        fold.add(key)
        validate_entrypoint(path.split("/")[-1] if "/" in path else path)
        size = int(item.get("size") or 0)
        if size < 0:
            raise ValueError(f"invalid file size: {path}")
        if size == 0:
            raise ValueError(f"empty file forbidden: {path}")
        if len(str(item.get("sha256") or "")) != 64:
            raise ValueError(f"invalid file digest: {path}")
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
