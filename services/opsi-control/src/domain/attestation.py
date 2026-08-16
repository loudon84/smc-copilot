from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from domain.ed25519util import canonical_json, verify_ed25519


def _canonical_iso(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


ATTESTATION_SCHEMA = "smc.opsi.depot-artifact-attestation.v2"
ATTESTATION_ALG = "Ed25519"


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
    algorithm: str = ATTESTATION_ALG
    key_id: str = ""
    envelope_digest: str = ""
    signer_key_id: str = ""
    readback_digest: str = ""
    readback_observed_at: datetime | None = None

    def canonical_payload(self) -> dict[str, str]:
        readback_at = ""
        if self.readback_observed_at is not None:
            readback_at = _canonical_iso(self.readback_observed_at)
        return {
            "schema": ATTESTATION_SCHEMA,
            "algorithm": self.algorithm or ATTESTATION_ALG,
            "artifactDigest": self.artifact_digest,
            "depotId": self.depot_id,
            "envelopeDigest": self.envelope_digest,
            "evidenceRef": self.evidence_ref,
            "expiresAt": _canonical_iso(self.expires_at),
            "generatedAt": _canonical_iso(self.generated_at),
            "issuer": self.issuer,
            "keyId": self.key_id or self.issuer,
            "packageVersion": self.package_version,
            "productId": self.product_id,
            "productVersion": self.product_version,
            "readbackDigest": self.readback_digest,
            "readbackObservedAt": readback_at,
            "signerKeyId": self.signer_key_id,
        }

    def digest(self) -> str:
        import hashlib

        return hashlib.sha256(canonical_json(self.canonical_payload())).hexdigest()


def attestation_valid(
    item: DepotArtifactAttestation,
    *,
    now: datetime,
    allowlist: set[str],
    revoked: set[str],
    expected_digest: str,
    expected_version: str,
    expected_package: str,
    public_keys: dict[str, str] | None = None,
    expected_envelope: str = "",
    expected_readback: str = "",
    expected_signer_key_id: str = "",
) -> bool:
    key_id = item.key_id or item.issuer
    if item.issuer not in allowlist and key_id not in allowlist:
        return False
    if item.issuer in revoked or item.signature in revoked or key_id in revoked:
        return False
    if now >= item.expires_at.astimezone(UTC):
        return False
    if item.artifact_digest != expected_digest:
        return False
    if item.product_version != expected_version or item.package_version != expected_package:
        return False
    if item.algorithm and item.algorithm != ATTESTATION_ALG:
        return False
    if expected_envelope and item.envelope_digest != expected_envelope:
        return False
    if expected_readback and item.readback_digest != expected_readback:
        return False
    if expected_signer_key_id and item.signer_key_id != expected_signer_key_id:
        return False
    keys = public_keys or {}
    public = keys.get(key_id) or keys.get(item.issuer)
    if not public:
        return False
    return verify_ed25519(public, canonical_json(item.canonical_payload()), item.signature)
