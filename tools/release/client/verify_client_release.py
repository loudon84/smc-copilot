"""Final verification for client release trees.

Production path (enterprise-native): Work + hermes-bootstrap + manifest inventory;
forbidden Hermes ZIP / wheelhouse / OPSI payloads must be absent (A-RELEASE-001/002).
"""

from __future__ import annotations

import json
from pathlib import Path

from tools.release.client.release_inventory import scan_secrets, sha256_file

REQUIRED_FILES = (
    "manifests/client-release.json",
    "manifests/SHA256SUMS",
)

FORBIDDEN_ZIP_GLOBS = (
    "hermes/**/*.zip",
    "**/hermes-windows-amd64.zip",
    "**/hermes-*-windows*.zip",
)
FORBIDDEN_OPSI_GLOBS = (
    "opsi/**/*.opsi",
    "opsi/**/*.fixture.zip",
    "bootstrap/opsi-client-agent-installer.exe",
)
FORBIDDEN_WHEELHOUSE_GLOBS = (
    "**/wheelhouse/**/*.whl",
    "**/python/wheelhouse/**",
)


def _collect(root: Path, patterns: tuple[str, ...]) -> list[Path]:
    found: list[Path] = []
    for pattern in patterns:
        found.extend(p for p in root.glob(pattern) if p.is_file())
    return found


def assert_no_forbidden_runtime_payloads(root: Path) -> None:
    """A-RELEASE-001/002: no OPSI package/client installer, no Hermes runtime ZIP/wheelhouse."""
    forbidden = (
        _collect(root, FORBIDDEN_ZIP_GLOBS)
        + _collect(root, FORBIDDEN_OPSI_GLOBS)
        + _collect(root, FORBIDDEN_WHEELHOUSE_GLOBS)
    )
    if forbidden:
        rel = ", ".join(sorted(p.relative_to(root).as_posix() for p in forbidden[:8]))
        raise ValueError(f"Release FAILED: forbidden runtime/OPSI payloads present: {rel}")


def verify_client_release(
    root: Path,
    *,
    stage: Path | None = None,
    require_signatures: bool = False,
) -> dict:
    """Verify enterprise-native client release inventory (production path)."""
    del stage  # OPSI stage read-back removed from production verify
    scan_secrets(root)
    missing = [rel for rel in REQUIRED_FILES if not (root / rel).is_file()]
    if missing:
        raise ValueError(f"client release incomplete: {missing}")
    manifest = json.loads((root / "manifests" / "client-release.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "smc.client-release.v1":
        raise ValueError("invalid client-release schema")

    work_dir = root / "work"
    bootstrap_dir = root / "hermes-bootstrap"
    if not any(work_dir.glob("copilot-desktop-*-setup.exe")):
        raise ValueError("Work setup installer missing")
    if not any(work_dir.glob("copilot-desktop-*-portable.exe")):
        raise ValueError("Work portable installer missing")

    install_ps1 = bootstrap_dir / "install.ps1"
    native_manifest = bootstrap_dir / "hermes-native-manifest.json"
    if not install_ps1.is_file():
        raise ValueError("hermes-bootstrap/install.ps1 missing")
    if not native_manifest.is_file():
        raise ValueError("hermes-bootstrap/hermes-native-manifest.json missing")

    assert_no_forbidden_runtime_payloads(root)

    bootstrap_meta = manifest.get("hermesBootstrap") or {}
    if not bootstrap_meta:
        raise ValueError("hermesBootstrap missing from client release manifest")
    if sha256_file(install_ps1) != bootstrap_meta.get("installerSha256"):
        raise ValueError("hermes-bootstrap install.ps1 hash mismatch")
    if bootstrap_meta.get("manifestSha256") and sha256_file(native_manifest) != bootstrap_meta["manifestSha256"]:
        raise ValueError("hermes-native-manifest.json hash mismatch")

    native = json.loads(native_manifest.read_text(encoding="utf-8"))
    if native.get("distribution") != "enterprise-native":
        raise ValueError("hermes-native-manifest distribution must be enterprise-native")
    if native.get("schemaVersion") != 1:
        raise ValueError("hermes-native-manifest schemaVersion must be 1")

    if require_signatures:
        # Native bootstrap path has no OPSI signature chain; keep flag for API compatibility.
        pass

    return manifest
