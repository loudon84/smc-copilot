from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class DepotArtifactAttestation:
    depot_id: str
    product_id: str
    product_version: str
    package_version: str
    artifact_digest: str
    issuer: str
    generated_at: datetime
    expires_at: datetime
    signature: str
    evidence_ref: str

    def digest(self) -> str:
        payload = {
            "depotId": self.depot_id,
            "productId": self.product_id,
            "productVersion": self.product_version,
            "packageVersion": self.package_version,
            "artifactDigest": self.artifact_digest,
            "issuer": self.issuer,
            "generatedAt": self.generated_at.astimezone(UTC).isoformat(),
            "expiresAt": self.expires_at.astimezone(UTC).isoformat(),
            "evidenceRef": self.evidence_ref,
        }
        return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode("utf-8")).hexdigest()


def attestation_valid(
    item: DepotArtifactAttestation,
    *,
    now: datetime,
    allowlist: set[str],
    revoked: set[str],
    expected_digest: str,
    expected_version: str,
    expected_package: str,
) -> bool:
    if item.issuer not in allowlist:
        return False
    if item.issuer in revoked or item.signature in revoked:
        return False
    if now >= item.expires_at.astimezone(UTC):
        return False
    if item.artifact_digest != expected_digest:
        return False
    if item.product_version != expected_version or item.package_version != expected_package:
        return False
    if len(item.signature) < 32:
        return False
    return True
