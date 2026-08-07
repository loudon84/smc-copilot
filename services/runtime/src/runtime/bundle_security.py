"""Secure runtime-bundle extraction and verification (PRD v1.6 FR-005).

Validates ZIP Slip, absolute paths, NTFS ADS, symlinks, size/count limits,
manifest, SHA-256, Ed25519 signature, runtime version, platform, architecture.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key


class BundleSecurityError(Exception):
    def __init__(self, message: str, *, code: str = "bundle_security") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class BundleLimits:
    max_files: int = 10_000
    max_total_bytes: int = 1_000_000_000
    max_single_file_bytes: int = 200_000_000


def _is_ads_path(member: str) -> bool:
    # NTFS Alternate Data Stream: file:stream or ending with :$DATA
    base = member.replace("\\", "/").split("/")[-1]
    if ":" in base:
        return True
    return False


def _is_symlink_info(info: zipfile.ZipInfo) -> bool:
    # Unix symlink: external_attr high bits == 0o120000
    return ((info.external_attr >> 16) & 0o170000) == 0o120000


def validate_zip_members(archive: Path, limits: BundleLimits | None = None) -> list[zipfile.ZipInfo]:
    limits = limits or BundleLimits()
    if not zipfile.is_zipfile(archive):
        raise BundleSecurityError("artifact is not a zip archive", code="invalid_archive")
    members: list[zipfile.ZipInfo] = []
    total = 0
    with zipfile.ZipFile(archive, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            member = info.filename.replace("\\", "/")
            if member.startswith("/") or member.startswith("\\"):
                raise BundleSecurityError(f"absolute path rejected: {member}", code="zip_slip")
            if ".." in member.split("/"):
                raise BundleSecurityError(f"path traversal rejected: {member}", code="zip_slip")
            if _is_ads_path(member):
                raise BundleSecurityError(f"NTFS ADS path rejected: {member}", code="ads_rejected")
            if _is_symlink_info(info):
                raise BundleSecurityError(f"symlink rejected: {member}", code="symlink_rejected")
            if info.file_size > limits.max_single_file_bytes:
                raise BundleSecurityError(
                    f"single file exceeds limit: {member}",
                    code="file_too_large",
                )
            total += info.file_size
            if total > limits.max_total_bytes:
                raise BundleSecurityError("archive exceeds maximum uncompressed size", code="archive_too_large")
            members.append(info)
            if len(members) > limits.max_files:
                raise BundleSecurityError("archive exceeds maximum file count", code="too_many_files")
    return members


def safe_extract_zip(
    archive: Path,
    dest_dir: Path,
    *,
    limits: BundleLimits | None = None,
) -> Path:
    """Extract zip with security checks. Members are written one-by-one (no blind extractall)."""
    limits = limits or BundleLimits()
    members = validate_zip_members(archive, limits)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest_dir.resolve()
    with zipfile.ZipFile(archive, "r") as zf:
        for info in members:
            member = info.filename.replace("\\", "/")
            target = (dest_dir / member).resolve()
            if dest_resolved not in target.parents and target != dest_resolved:
                raise BundleSecurityError(f"path traversal rejected: {member}", code="zip_slip")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as src, open(target, "wb") as dst:
                remaining = info.file_size
                while remaining > 0:
                    chunk = src.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    dst.write(chunk)
                    remaining -= len(chunk)
    return dest_dir


def sha256_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def load_bundle_manifest(staging_dir: Path) -> dict[str, Any]:
    path = staging_dir / "manifest.json"
    if not path.is_file():
        raise BundleSecurityError("manifest.json missing", code="manifest_missing")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BundleSecurityError("manifest.json invalid JSON", code="manifest_invalid") from exc
    if not isinstance(data, dict):
        raise BundleSecurityError("manifest.json must be an object", code="manifest_invalid")
    return data


def verify_manifest_fields(
    manifest: dict[str, Any],
    *,
    expected_version: str | None = None,
    expected_platform: str = "windows",
    expected_arch: str = "x86_64",
) -> None:
    version = str(manifest.get("version") or "")
    platform = str(manifest.get("platform") or "").lower()
    arch = str(manifest.get("architecture") or manifest.get("arch") or "").lower()
    if expected_version and version and version != expected_version:
        raise BundleSecurityError(
            f"runtime version mismatch: {version} != {expected_version}",
            code="version_mismatch",
        )
    if platform and platform not in {expected_platform, "win32", "win-x64"}:
        raise BundleSecurityError(f"platform mismatch: {platform}", code="platform_mismatch")
    if arch and arch.replace("-", "_") not in {expected_arch, "amd64", "x64"}:
        raise BundleSecurityError(f"architecture mismatch: {arch}", code="arch_mismatch")
    if manifest.get("placeholder") is True:
        raise BundleSecurityError("placeholder bundle cannot be applied", code="placeholder_bundle")


def verify_sha256(path: Path, expected_hex: str) -> None:
    actual = sha256_file(path)
    if actual.lower() != expected_hex.strip().lower():
        raise BundleSecurityError("SHA-256 mismatch", code="checksum_mismatch")


def verify_ed25519_signature(*, payload: bytes, signature_b64: str, public_key_b64_or_pem: str) -> None:
    import base64

    try:
        sig = base64.b64decode(signature_b64)
    except Exception as exc:
        raise BundleSecurityError("invalid signature encoding", code="signature_invalid") from exc

    raw_key = public_key_b64_or_pem.strip()
    try:
        if "BEGIN" in raw_key:
            pub = load_pem_public_key(raw_key.encode("utf-8"))
            if not isinstance(pub, Ed25519PublicKey):
                raise BundleSecurityError("public key is not Ed25519", code="signature_invalid")
        else:
            key_bytes = base64.b64decode(raw_key)
            pub = Ed25519PublicKey.from_public_bytes(key_bytes)
        pub.verify(sig, payload)
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise BundleSecurityError("Ed25519 signature verification failed", code="signature_invalid") from exc


def verify_bundle_artifact(
    artifact: Path,
    *,
    expected_sha256: str | None = None,
    signature_b64: str | None = None,
    public_key: str | None = None,
    expected_version: str | None = None,
    limits: BundleLimits | None = None,
) -> dict[str, Any]:
    """Validate archive security + optional hash/signature; return extracted manifest if present in zip."""
    validate_zip_members(artifact, limits)
    if expected_sha256:
        verify_sha256(artifact, expected_sha256)
    if signature_b64 and public_key:
        verify_ed25519_signature(
            payload=artifact.read_bytes()
            if artifact.stat().st_size < 32 * 1024 * 1024
            else sha256_file(artifact).encode(),
            signature_b64=signature_b64,
            public_key_b64_or_pem=public_key,
        )
    # Peek manifest without full extract
    with zipfile.ZipFile(artifact, "r") as zf:
        names = {n.replace("\\", "/") for n in zf.namelist()}
        if "manifest.json" not in names:
            raise BundleSecurityError("manifest.json missing in archive", code="manifest_missing")
        raw = zf.read("manifest.json")
        try:
            manifest = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BundleSecurityError("manifest.json invalid", code="manifest_invalid") from exc
    verify_manifest_fields(manifest, expected_version=expected_version)
    return manifest
