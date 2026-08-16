from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from crypto_fixtures import LAB_ATTESTATION_SK, OPERATOR_RELEASE_SK, sign_attestation_fields, signed_reentry_gate
from fastapi.testclient import TestClient

from app import build_test_state, create_app
from core.auth import AuthPrincipal
from core.config import Settings
from core.errors import OpsiControlError
from db.repositories.interfaces import ResultRecord
from db.repositories.rollout_memory import MemoryRolloutStore
from db.repositories.rollout_records import TargetVerificationStoreRecord
from domain.attestation import DepotArtifactAttestation, attestation_valid
from domain.ed25519util import canonical_json, sign_ed25519
from domain.inventory import snapshot_from_parts
from domain.policy import CONTROLLED_REENTRY_V15, ENGINEERING_V13, PRODUCTION_REENTRY_GATE, satisfies_v15_live_gate
from domain.rings import split_rings
from domain.verification import VerificationDecision, VerificationKind
from schemas.models import ActionStatus
from schemas.rollout import (
    ApproveRequest,
    ArtifactChannel,
    ArtifactPromoteRequest,
    BatchStatus,
    RolloutCreateRequest,
    RolloutRole,
    StartRequest,
    TargetStatus,
)

DIGEST = "aa" * 32
REASON = {"reason": "v15 reentry lab", "changeTicket": "CHG-1501"}


def _auth(token, *roles: str, subject: str = "ops", idem: str = "idem-v15") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(subject=subject, roles=list(roles))}",
        "Idempotency-Key": idem,
    }


def _seed_hosts(state, ids: list[str], depot: str = "depot.example") -> None:
    now = datetime.now(UTC)
    template = state.inventory_store.bindings["client-a.example"]
    evidence = dict(state.inventory_store.evidence["client-a.example"])
    for client_id in ids:
        state.rpc.hosts.append(
            {"id": client_id, "type": "OpsiClient", "description": "windows10", "lastSeenMinutes": 5}
        )
        state.rpc.depot_mapping[client_id] = depot
        binding = type(template)(
            client_id=client_id,
            user_sid=template.user_sid,
            user_account=template.user_account,
            evidence_ref=template.evidence_ref,
            revision=1,
            approved_by=template.approved_by,
            observed_at=now,
            reason=template.reason,
            change_ticket=template.change_ticket,
        )
        state.inventory_store.bindings[client_id] = binding
        state.inventory_store.evidence[client_id] = evidence
        snap = snapshot_from_parts(
            client_id=client_id,
            rpc_host={"description": "windows10", "lastSeenMinutes": 5},
            depot_id=depot,
            binding=binding,
            evidence=evidence,
            now=now,
        )
        assert snap is not None
        state.inventory_store.snapshots[client_id] = snap


def test_controlled_policy_is_live_and_engineering_is_not():
    assert satisfies_v15_live_gate(CONTROLLED_REENTRY_V15)
    assert not satisfies_v15_live_gate(ENGINEERING_V13)


def test_production_default_rejects_over_50():
    with pytest.raises(Exception) as exc:
        RolloutCreateRequest.model_validate(
            {
                "reason": "too-big",
                "changeTicket": "CHG-1",
                "campaignId": "cmp_toobig001",
                "name": "too-big",
                "mode": "production",
                "clientIds": [f"h{i:03d}.example" for i in range(51)],
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "artifactDigest": DIGEST,
                "signerKeyId": "lab-signer",
                "configRevision": 1,
            }
        )
    assert "21-50" in str(exc.value)


def test_engineering_500_eight_depots_deterministic():
    mapping = {f"c{i:03d}.example": f"depot-{(i % 8) + 1}.example" for i in range(500)}
    first = split_rings(mapping, ENGINEERING_V13)
    second = split_rings(mapping, ENGINEERING_V13)
    assert first == second
    ring0 = first[0][1]
    assert 8 <= len(ring0) <= 25
    assert {mapping[item] for item in ring0} == set(mapping.values())


def test_controlled_reentry_21_two_depots():
    mapping = {f"h{i:03d}.example": f"depot-{(i % 2) + 1}.example" for i in range(21)}
    rings = split_rings(mapping, CONTROLLED_REENTRY_V15)
    ring0 = rings[0][1]
    assert len(ring0) <= 4
    assert {mapping[item] for item in ring0} == set(mapping.values())
    assert rings[-1][2] == 24 * 7


def test_weak_attestation_signature_rejected(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    now = datetime.now(UTC)
    attested = client.post(
        "/api/v1/opsi/depot-attestations",
        headers=_auth(token, "release_owner", idem="att-weak"),
        json={
            "depotId": "depot.example",
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "issuer": "opsi-lab-signer",
            "generatedAt": now.isoformat(),
            "expiresAt": (now + timedelta(days=7)).isoformat(),
            "signature": "sig" + "ab" * 16,
            "evidenceRef": "test://attestation",
            **REASON,
        },
    )
    assert attested.status_code == 400


def test_valid_attestation_v2_accepted(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    now = datetime.now(UTC)
    signature = sign_attestation_fields(
        depot_id="depot.example",
        product_version="0.22.0",
        package_version="1",
        artifact_digest=DIGEST,
        generated_at=now,
        expires_at=now + timedelta(days=7),
    )
    attested = client.post(
        "/api/v1/opsi/depot-attestations",
        headers=_auth(token, "release_owner", idem="att-ok"),
        json={
            "depotId": "depot.example",
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "issuer": "opsi-lab-signer",
            "keyId": "opsi-lab-signer",
            "generatedAt": now.isoformat(),
            "expiresAt": (now + timedelta(days=7)).isoformat(),
            "signature": signature,
            "evidenceRef": "test://attestation",
            **REASON,
        },
    )
    assert attested.status_code == 200, attested.text


def test_attestation_v2_cryptographic_negative_vectors():
    now = datetime.now(UTC)
    keys = {"opsi-lab-signer": "74d053ad636f9884be52c8a3c4e5e02973837f27a76e20273f0dcdd2bf179de6"}
    unsigned = DepotArtifactAttestation(
        depot_id="depot.example",
        product_id="smc-hermes-agent",
        product_version="0.22.0",
        package_version="1",
        artifact_digest=DIGEST,
        issuer="opsi-lab-signer",
        generated_at=now,
        expires_at=now + timedelta(days=7),
        signature="",
        evidence_ref="test://attestation",
        key_id="opsi-lab-signer",
        envelope_digest="",
        signer_key_id="",
        readback_digest="",
    )
    payload = canonical_json(unsigned.canonical_payload())
    valid_sig = sign_ed25519(LAB_ATTESTATION_SK, payload)
    valid = replace(unsigned, signature=valid_sig)
    kwargs = {
        "now": now,
        "allowlist": {"opsi-lab-signer"},
        "revoked": set(),
        "expected_digest": DIGEST,
        "expected_version": "0.22.0",
        "expected_package": "1",
        "public_keys": keys,
    }
    assert attestation_valid(valid, **kwargs)
    tampered = replace(valid, artifact_digest="bb" * 32)
    assert not attestation_valid(tampered, **{**kwargs, "expected_digest": "bb" * 32})
    wrong_key = replace(unsigned, signature=sign_ed25519(OPERATOR_RELEASE_SK, payload))
    assert not attestation_valid(wrong_key, **kwargs)
    expired = replace(valid, expires_at=now - timedelta(minutes=1))
    assert not attestation_valid(expired, **kwargs)
    assert not attestation_valid(valid, **{**kwargs, "revoked": {"opsi-lab-signer"}})
    envelope = replace(unsigned, envelope_digest="cc" * 32)
    envelope_sig = sign_ed25519(LAB_ATTESTATION_SK, canonical_json(envelope.canonical_payload()))
    envelope = replace(envelope, signature=envelope_sig)
    assert not attestation_valid(envelope, **{**kwargs, "expected_envelope": "dd" * 32})
    drifted = replace(unsigned, readback_digest="ee" * 32)
    drifted_sig = sign_ed25519(LAB_ATTESTATION_SK, canonical_json(drifted.canonical_payload()))
    drifted = replace(drifted, signature=drifted_sig)
    assert not attestation_valid(drifted, **{**kwargs, "expected_readback": "ff" * 32})


def test_verification_replay_idempotent_and_conflict():
    now = datetime.now(UTC)
    store = MemoryRolloutStore()
    record = TargetVerificationStoreRecord(
        campaign_id="cmp_v15replay",
        client_id="client-a.example",
        action_id="act-1",
        kind=VerificationKind.APPLY.value,
        action_result_digest=DIGEST,
        parent_result_digest="",
        product_readback_digest=DIGEST,
        inventory_digest=DIGEST,
        gateway_evidence_ref="gw://ok",
        work_evidence_ref="work://ok",
        desired_version="0.22.0",
        desired_package="1",
        desired_artifact=DIGEST,
        desired_config="1",
        desired_owner="opsi",
        observed_version="0.22.0",
        observed_package="1",
        observed_artifact=DIGEST,
        observed_config="1",
        observed_owner="opsi",
        observed_tasks="ok",
        observed_health="HEALTHY",
        decision=VerificationDecision.HEALTHY.value,
        reason="verified",
        observed_at=now,
        expires_at=now + timedelta(hours=1),
        canonical_digest=DIGEST,
    )
    asyncio.run(store.put_verification(record))
    asyncio.run(store.put_verification(record))
    conflict = replace(record, canonical_digest="bb" * 32, reason="other")
    with pytest.raises(OpsiControlError) as exc:
        asyncio.run(store.put_verification(conflict))
    assert exc.value.status_code == 409


def test_production_seed_and_env_and_body_cannot_unfreeze(token):
    settings = Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
        production_reentry_go="GO",
    )
    state = build_test_state(settings)
    state.rollouts.settings = Settings(
        opsi_env="production",
        jwt_lab_secret="prod-secret-not-lab-secret-32b",
        oidc_issuer="https://idp.example/realms/smc",
        oidc_jwks_url="https://idp.example/realms/smc/certs",
        opsi_rpc_url="https://opsi.example/rpc",
        opsi_rpc_username="u",
        opsi_rpc_password_ref="OPSI_RPC_PASSWORD",
        secret_provider_url="https://vault.example/v1/secret",
        production_reentry_go="GO",
    )
    with pytest.raises(OpsiControlError) as seeded:
        asyncio.run(state.rollouts.seed_live_gate_for_test())
    assert seeded.value.status_code == 403
    with pytest.raises(OpsiControlError) as gate:
        asyncio.run(state.rollouts._assert_live_gate(PRODUCTION_REENTRY_GATE))
    assert gate.value.status_code == 412

    lab = build_test_state()
    client = TestClient(create_app(lab))
    body = signed_reentry_gate(decision="GO")
    body["approvals"][0]["signature"] = "AAAA" + "b" * 40
    forged = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="gate-forged"),
        json=body,
    )
    assert forged.status_code == 400
    with pytest.raises(OpsiControlError):
        asyncio.run(lab.rollouts._assert_live_gate(PRODUCTION_REENTRY_GATE))


def test_signed_gate_import_and_revoke(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    imported = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="gate-ok"),
        json=signed_reentry_gate(),
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["decision"] == "GO"
    asyncio.run(state.rollouts._assert_live_gate(PRODUCTION_REENTRY_GATE))
    revoked = client.post(
        "/api/v1/opsi/live-gates/v1.5-production-reentry/revoke",
        headers=_auth(token, "security_owner", idem="gate-rev"),
        json={"reason": "incident", "changeTicket": "CHG-1599"},
    )
    assert revoked.status_code == 200
    with pytest.raises(OpsiControlError) as exc:
        asyncio.run(state.rollouts._assert_live_gate(PRODUCTION_REENTRY_GATE))
    assert exc.value.status_code == 412


def test_observation_does_not_start_on_dispatch(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    asyncio.run(state.rollouts.seed_live_gate_for_test())
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v15obs01",
            "name": "observe-late",
            "clientIds": ["client-b.example", "client-a.example", "client-c.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    assert created.status_code == 200, created.text
    client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="promo"),
        json={
            "schema": "smc.opsi.artifact-promotion.v1",
            "productVersion": "0.22.0",
            "digest": DIGEST,
            "signerKeyId": "lab-signer",
            "fromChannel": "testing",
            "toChannel": "pilot",
            "evidenceRef": "test://v1.1",
            **REASON,
        },
    )
    client.post(
        "/api/v1/opsi/rollouts/cmp_v15obs01/preflight",
        headers={**_auth(token, "release_owner", idem="pre"), "If-Match": "1"},
        json=REASON,
    )
    client.post(
        "/api/v1/opsi/rollouts/cmp_v15obs01/approve",
        headers={**_auth(token, "release_owner", subject="rel", idem="a1"), "If-Match": "2"},
        json={**REASON, "kind": "start"},
    )
    client.post(
        "/api/v1/opsi/rollouts/cmp_v15obs01/approve",
        headers={**_auth(token, "endpoint_ops", subject="ops2", idem="a2"), "If-Match": "2"},
        json={**REASON, "kind": "start"},
    )
    started = client.post(
        "/api/v1/opsi/rollouts/cmp_v15obs01/start",
        headers={**_auth(token, "release_owner", subject="rel", idem="start"), "If-Match": "2"},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    asyncio.run(state.rollouts.dispatch_once("w1"))
    batches = asyncio.run(state.rollouts.store.list_batches("cmp_v15obs01"))
    assert all(item.status != BatchStatus.OBSERVING.value for item in batches)


def test_facts_success_without_result_is_not_healthy():
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    campaign_id = "cmp_v15facts1"
    asyncio.run(_mini_running_campaign(state, campaign_id))
    targets = asyncio.run(state.rollouts.store.list_targets(campaign_id))
    dispatched = next(item for item in targets if item.action_id)
    dispatched.status = TargetStatus.VERIFYING.value
    asyncio.run(state.rollouts.store.put_target(dispatched))
    state.rollouts.facts[dispatched.client_id] = {
        "resultChecksum": "yes",
        "productReadback": "yes",
        "gatewayProbe": "yes",
        "workSmoke": "yes",
    }
    asyncio.run(state.rollouts.reconcile_once("rec"))
    refreshed = asyncio.run(state.rollouts.store.get_campaign(campaign_id))
    assert refreshed is not None
    after = asyncio.run(state.rollouts.store.list_targets(campaign_id))
    item = next(row for row in after if row.client_id == dispatched.client_id)
    assert item.status != TargetStatus.HEALTHY.value


def test_repository_result_makes_target_healthy_without_facts():
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    campaign_id = "cmp_v15auth01"
    asyncio.run(_mini_running_campaign(state, campaign_id))
    targets = asyncio.run(state.rollouts.store.list_targets(campaign_id))
    target = next(item for item in targets if item.action_id)
    action = asyncio.run(state.actions.repos.actions.get(target.action_id))
    assert action is not None
    action.status = ActionStatus.SUCCEEDED
    asyncio.run(state.actions.repos.actions.put(action))
    asyncio.run(
        state.actions.repos.results.put(
            ResultRecord(
                request_id=target.action_id,
                client_id=target.client_id,
                status=ActionStatus.SUCCEEDED,
                sha256=DIGEST,
                body_digest=DIGEST,
            )
        )
    )
    state.rpc.product_on_client[f"{target.client_id}:smc-hermes-agent"] = {
        "clientId": target.client_id,
        "productId": "smc-hermes-agent",
        "productVersion": "0.22.0",
        "packageVersion": "1",
        "installationStatus": "installed",
    }
    snap = state.inventory_store.snapshots[target.client_id]
    state.inventory_store.snapshots[target.client_id] = replace(snap, previous_version="0.22.0", previous_digest=DIGEST)
    state.rollouts.facts.clear()
    for _ in range(4):
        asyncio.run(state.rollouts.reconcile_once("rec"))
    after = asyncio.run(state.rollouts.store.list_targets(campaign_id))
    item = next(row for row in after if row.client_id == target.client_id)
    assert item.status == TargetStatus.HEALTHY.value
    records = asyncio.run(state.rollouts.store.list_verifications(campaign_id))
    assert records and records[0].decision == VerificationDecision.HEALTHY.value


def test_next_ring_requires_predecessor_passed(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    ids = [f"h{i:03d}.example" for i in range(21)]
    _seed_hosts(state, ids)
    client = TestClient(create_app(state))
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v15ring01",
            "name": "rings",
            "mode": "production",
            "clientIds": ids,
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    assert created.status_code == 200, created.text
    imported = client.post(
        "/api/v1/opsi/live-gates/import",
        headers=_auth(token, "security_owner", idem="gate-ring"),
        json=signed_reentry_gate(),
    )
    assert imported.status_code == 200, imported.text
    campaign = asyncio.run(state.rollouts.store.get_campaign("cmp_v15ring01"))
    principal = AuthPrincipal(
        subject="ops",
        principal_type="user",
        scopes=frozenset({"opsi.rollout.admin"}),
        roles=frozenset({RolloutRole.RELEASE_OWNER.value}),
    )
    with pytest.raises(OpsiControlError) as exc:
        asyncio.run(
            state.rollouts.approve_ring(
                "cmp_v15ring01",
                1,
                ApproveRequest.model_validate({"reason": "next ring", "changeTicket": "CHG-15", "kind": "next_ring"}),
                principal,
                campaign.revision,
            )
        )
    assert exc.value.status_code == 412


def test_evidence_manifest_v3_is_nogo(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v15evd01",
            "name": "evidence",
            "clientIds": ["client-b.example", "client-a.example", "client-c.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    assert created.status_code == 200
    evidence = client.get(
        "/api/v1/opsi/rollouts/cmp_v15evd01/evidence",
        headers=_auth(token, "release_owner"),
    ).json()
    assert evidence["schema"] == "smc.opsi.evidence-manifest.v3"
    assert evidence["decision"] == "NO-GO"
    assert evidence["verification"] in {"implemented", "verified"}
    assert evidence["verification"] != "proven"


async def _mini_running_campaign(state, campaign_id: str) -> None:
    principal = AuthPrincipal(
        subject="ops",
        principal_type="user",
        scopes=frozenset({"opsi.rollout.admin"}),
        roles=frozenset({RolloutRole.RELEASE_OWNER.value, RolloutRole.ENDPOINT_OPS.value}),
    )
    ops = AuthPrincipal(
        subject="ops2",
        principal_type="user",
        scopes=frozenset({"opsi.rollout.admin"}),
        roles=frozenset({RolloutRole.ENDPOINT_OPS.value}),
    )
    await state.rollouts.seed_live_gate_for_test()
    await state.rollouts.create(
        RolloutCreateRequest.model_validate(
            {
                "reason": "mini",
                "changeTicket": "CHG-15",
                "campaignId": campaign_id,
                "name": "mini",
                "clientIds": ["client-b.example", "client-a.example", "client-c.example"],
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "artifactDigest": DIGEST,
                "signerKeyId": "lab-signer",
                "configRevision": 1,
            }
        ),
        principal,
        "idem-mini",
    )
    await state.rollouts.promote(
        ArtifactPromoteRequest.model_validate(
            {
                "reason": "promo",
                "changeTicket": "CHG-15",
                "productVersion": "0.22.0",
                "digest": DIGEST,
                "signerKeyId": "lab-signer",
                "fromChannel": ArtifactChannel.TESTING,
                "toChannel": ArtifactChannel.PILOT,
                "evidenceRef": "test://v1.1",
            }
        ),
        principal,
    )
    await state.rollouts.preflight(campaign_id, principal, 1)
    await state.rollouts.approve(
        campaign_id,
        ApproveRequest.model_validate({"reason": "start", "changeTicket": "CHG-15", "kind": "start"}),
        principal,
        2,
    )
    await state.rollouts.approve(
        campaign_id,
        ApproveRequest.model_validate({"reason": "start", "changeTicket": "CHG-15", "kind": "start"}),
        ops,
        2,
    )
    await state.rollouts.start(
        campaign_id, StartRequest.model_validate({"reason": "start", "changeTicket": "CHG-15"}), principal, 2
    )
    await state.rollouts.dispatch_once("w1")
