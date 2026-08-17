from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from domain.attestation import DepotArtifactAttestation
from domain.ed25519util import canonical_json, sign_ed25519
from domain.live_gate import gate_canonical_payload
from domain.policy import PRODUCTION_REENTRY_GATE

# TEST-ONLY Ed25519 seeds. Never used in lab/production assemblies.
LAB_ATTESTATION_SK = "13a62c79bf0cb01f16125293d952c706ffd38e3c4928372d261b01dde088fbc9"
OPERATOR_RELEASE_SK = "65624c0ef3a087be7dd75d0b6259ab628cc54afbf4d020fd1b39460ffc7c07c8"
OPERATOR_OPS_SK = "62cd66150a3415e943fcd81ddbb62d4c4076a5dbe99e1923c0297789fb6ef746"
OPERATOR_SECURITY_SK = "cb7ec124a704bc190aefac8c70abda4782e85791a19c4867ad1e62b082fed9e6"


def sign_attestation_fields(
    *,
    depot_id: str,
    product_version: str,
    package_version: str,
    artifact_digest: str,
    generated_at: datetime,
    expires_at: datetime,
    issuer: str = "opsi-lab-signer",
    evidence_ref: str = "test://attestation",
    envelope_digest: str = "",
    signer_key_id: str = "",
    readback_digest: str = "",
    readback_observed_at: datetime | None = None,
) -> str:
    item = DepotArtifactAttestation(
        depot_id=depot_id,
        product_id="smc-hermes-agent",
        product_version=product_version,
        package_version=package_version,
        artifact_digest=artifact_digest,
        issuer=issuer,
        generated_at=generated_at,
        expires_at=expires_at,
        signature="",
        evidence_ref=evidence_ref,
        key_id=issuer,
        envelope_digest=envelope_digest,
        signer_key_id=signer_key_id,
        readback_digest=readback_digest,
        readback_observed_at=readback_observed_at,
    )
    return sign_ed25519(LAB_ATTESTATION_SK, canonical_json(item.canonical_payload()))


def signed_reentry_gate(
    *,
    decision: str = "GO",
    evidence_ref: str = "operator://v1.5",
    expires_at: datetime | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    expiry = expires_at or (datetime.now(UTC) + timedelta(days=7))
    payload = {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": PRODUCTION_REENTRY_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "v14Gate": "v1.4-win10-clean-endpoint",
        "pilotPolicy": "accelerated-v1.4",
        "productionPolicy": "controlled-reentry-v1.5",
    }
    if extra:
        payload.update(extra)
    canonical = canonical_json(gate_canonical_payload(payload))
    digest = hashlib.sha256(canonical).hexdigest()
    approvals = [
        {
            "role": "release_owner",
            "keyId": "operator-release",
            "signature": sign_ed25519(OPERATOR_RELEASE_SK, canonical),
        },
        {
            "role": "endpoint_ops",
            "keyId": "operator-endpoint-ops",
            "signature": sign_ed25519(OPERATOR_OPS_SK, canonical),
        },
        {
            "role": "security_owner",
            "keyId": "operator-security",
            "signature": sign_ed25519(OPERATOR_SECURITY_SK, canonical),
        },
    ]
    return {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": PRODUCTION_REENTRY_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "inputDigest": digest,
        "payload": payload,
        "approvals": approvals,
    }


def signed_controller_gate(
    *,
    decision: str = "GO",
    evidence_ref: str = "operator://v1.6",
    expires_at: datetime | None = None,
) -> dict[str, Any]:
    from domain.policy import CONTROLLER_GATE

    expiry = expires_at or (datetime.now(UTC) + timedelta(days=7))
    payload = {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": CONTROLLER_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "controllerProof": "windows10-install-to-control",
    }
    canonical = canonical_json(gate_canonical_payload(payload))
    digest = hashlib.sha256(canonical).hexdigest()
    approvals = [
        {
            "role": "release_owner",
            "keyId": "operator-release",
            "signature": sign_ed25519(OPERATOR_RELEASE_SK, canonical),
        },
        {
            "role": "endpoint_ops",
            "keyId": "operator-endpoint-ops",
            "signature": sign_ed25519(OPERATOR_OPS_SK, canonical),
        },
        {
            "role": "security_owner",
            "keyId": "operator-security",
            "signature": sign_ed25519(OPERATOR_SECURITY_SK, canonical),
        },
    ]
    return {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": CONTROLLER_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "inputDigest": digest,
        "payload": payload,
        "approvals": approvals,
    }


def signed_client_deployment_gate(
    *,
    decision: str = "GO",
    evidence_ref: str = "operator://v1.7",
    expires_at: datetime | None = None,
) -> dict[str, Any]:
    from domain.policy import CLIENT_DEPLOYMENT_GATE

    expiry = expires_at or (datetime.now(UTC) + timedelta(days=7))
    payload = {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": CLIENT_DEPLOYMENT_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "windowsProof": "w10-01-to-w10-05",
    }
    canonical = canonical_json(gate_canonical_payload(payload))
    digest = hashlib.sha256(canonical).hexdigest()
    approvals = [
        {
            "role": "release_owner",
            "keyId": "operator-release",
            "signature": sign_ed25519(OPERATOR_RELEASE_SK, canonical),
        },
        {
            "role": "endpoint_ops",
            "keyId": "operator-endpoint-ops",
            "signature": sign_ed25519(OPERATOR_OPS_SK, canonical),
        },
        {
            "role": "security_owner",
            "keyId": "operator-security",
            "signature": sign_ed25519(OPERATOR_SECURITY_SK, canonical),
        },
    ]
    return {
        "schema": "smc.opsi.live-gate.v1",
        "gateId": CLIENT_DEPLOYMENT_GATE,
        "decision": decision,
        "evidenceRef": evidence_ref,
        "expiresAt": expiry.isoformat(),
        "inputDigest": digest,
        "payload": payload,
        "approvals": approvals,
    }
