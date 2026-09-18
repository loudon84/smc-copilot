"""Build hermes-native-manifest.json provenance (PRD §9.2)."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Union


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_hermes_native_manifest(
    config: dict[str, Any],
    installer_bytes_or_path: Union[bytes, Path, str],
) -> dict[str, Any]:
    """Produce schemaVersion 1 hermes-native-manifest from a loaded v2 config.

    ``installer_bytes_or_path`` is the exact bytes of the bundled enterprise-fork
    ``install.ps1`` (or a path to those bytes).
    """
    if isinstance(installer_bytes_or_path, (str, Path)):
        installer_bytes = Path(installer_bytes_or_path).read_bytes()
    else:
        installer_bytes = installer_bytes_or_path

    hermes = config.get("hermes") or {}
    source = hermes.get("source") or {}
    compatibility = hermes.get("compatibility") or {}
    policy = hermes.get("policy") or {}

    identity = source.get("identity")
    if not identity:
        install_url = source.get("installUrl")
        if not install_url:
            raise ValueError("RELEASE_CONFIG_INVALID: missing hermes.source.installUrl/identity")
        from tools.release.client.release_config import repository_identity

        identity = repository_identity(str(install_url))

    approved = source.get("approvedCommit")
    if not isinstance(approved, str) or len(approved) != 40:
        raise ValueError("RELEASE_CONFIG_INVALID: missing hermes.source.approvedCommit")

    min_version = compatibility.get("minVersion")
    tested_version = compatibility.get("testedVersion")
    if not isinstance(min_version, str) or not isinstance(tested_version, str):
        raise ValueError("RELEASE_CONFIG_INVALID: hermes.compatibility versions required")

    policy_version = policy.get("version")
    if not isinstance(policy_version, str) or not policy_version:
        raise ValueError("RELEASE_CONFIG_INVALID: hermes.policy.version required")

    return {
        "schemaVersion": 1,
        "distribution": "enterprise-native",
        "repositoryIdentity": identity,
        "approvedCommit": approved,
        "installerSha256": _sha256_bytes(installer_bytes),
        "policyVersion": policy_version,
        "compatibility": {
            "minVersion": min_version,
            "testedVersion": tested_version,
        },
    }
