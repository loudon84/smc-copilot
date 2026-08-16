from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app import build_test_state, create_app
from core.config import Settings
from domain.preflight import window_in_utc
from domain.rings import mapping_digest, split_rings
from schemas.rollout import CampaignMode, RolloutCreateRequest, TargetStatus

DIGEST = "aa" * 32
REASON = {"reason": "v13 production lab", "changeTicket": "CHG-1301"}


def _auth(token, *roles: str, subject: str = "ops", idem: str = "idem-v13") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(subject=subject, roles=list(roles))}",
        "Idempotency-Key": idem,
    }


def _facts_for(client_id: str, depot_id: str = "depot.example") -> dict:
    return {
        "os": "windows11",
        "lastSeenMinutes": 5,
        "owner": "opsi",
        "diskFreeMb": 4096,
        "userSid": "S-1-5-21-1-2-3-1001",
        "userAccount": "lab\\user-a",
        "gatewayHealthy": True,
        "previousVersion": "0.21.0",
        "previousDigest": "ab" * 32,
        "depotId": depot_id,
        "bindingSource": "operator-evidence",
    }


def test_missing_inventory_is_ineligible(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    state.rollouts.facts["client-a.example"] = {"os": "windows11"}
    client = TestClient(create_app(state))
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v13miss01",
            "name": "missing-facts",
            "clientIds": ["client-b.example", "client-a.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    assert created.status_code == 200, created.text
    asyncio.run(state.rollouts.seed_live_gate_for_test())
    client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-promo"),
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
    pre = client.post(
        "/api/v1/opsi/rollouts/cmp_v13miss01/preflight",
        headers={**_auth(token, "release_owner", idem="idem-pre"), "If-Match": "1"},
        json=REASON,
    )
    assert pre.status_code == 200
    targets = client.get(
        "/api/v1/opsi/rollouts/cmp_v13miss01/targets",
        headers=_auth(token, "release_owner"),
    ).json()["items"]
    assert any(item["status"] == TargetStatus.INELIGIBLE.value for item in targets)


def test_create_defaults_to_pilot_mode(token):
    req = RolloutCreateRequest.model_validate(
        {
            "reason": "pilot",
            "changeTicket": "CHG-1",
            "campaignId": "cmp_default01",
            "name": "default-pilot",
            "clientIds": ["a.example", "b.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
        }
    )
    assert req.mode == CampaignMode.PILOT


def test_production_mode_rejects_small_fleet():
    try:
        RolloutCreateRequest.model_validate(
            {
                "reason": "prod",
                "changeTicket": "CHG-1",
                "campaignId": "cmp_toosmall1",
                "name": "too-small",
                "mode": "production",
                "clientIds": [f"h{i}.example" for i in range(10)],
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "artifactDigest": DIGEST,
                "signerKeyId": "lab-signer",
                "configRevision": 1,
            }
        )
    except Exception as exc:
        assert "21-500" in str(exc)
    else:
        raise AssertionError("expected validation error")


def test_rings_are_deterministic_and_cover_depots():
    mapping = {f"c{i:03d}.example": f"depot-{(i % 8) + 1}.example" for i in range(500)}
    first = split_rings(mapping)
    second = split_rings(mapping)
    assert first == second
    assert mapping_digest(mapping) == mapping_digest(dict(reversed(list(mapping.items()))))
    ring0 = first[0][1]
    assert 8 <= len(ring0) <= 25
    assert {mapping[item] for item in ring0} == set(mapping.values())
    assigned = [client for _index, members, _hours in first for client in members]
    assert sorted(assigned) == sorted(mapping)


def test_dst_window_converts_to_utc():
    start = datetime(2026, 3, 8, 1, 30)
    end = datetime(2026, 3, 8, 4, 0)
    utc_start, utc_end = window_in_utc(start, end, "UTC")
    assert utc_start.tzinfo is UTC
    assert utc_end - utc_start == timedelta(hours=2, minutes=30)
    est = timezone(timedelta(hours=-5))
    edt = timezone(timedelta(hours=-4))
    before = datetime(2026, 3, 8, 1, 0, tzinfo=est).astimezone(UTC)
    after = datetime(2026, 3, 8, 3, 0, tzinfo=edt).astimezone(UTC)
    assert after - before == timedelta(hours=1)


def test_rollback_enqueues_without_success(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    asyncio.run(state.rollouts.seed_live_gate_for_test())
    client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-promo"),
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
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v13roll01",
            "name": "rollback-queue",
            "clientIds": ["client-b.example", "client-a.example"],
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
        "/api/v1/opsi/rollouts/cmp_v13roll01/preflight",
        headers={**_auth(token, "release_owner", idem="pre"), "If-Match": "1"},
        json=REASON,
    )
    client.post(
        "/api/v1/opsi/rollouts/cmp_v13roll01/approve",
        headers={**_auth(token, "release_owner", subject="rel", idem="a1"), "If-Match": "2"},
        json={**REASON, "kind": "start"},
    )
    client.post(
        "/api/v1/opsi/rollouts/cmp_v13roll01/approve",
        headers={**_auth(token, "endpoint_ops", subject="ops2", idem="a2"), "If-Match": "2"},
        json={**REASON, "kind": "start"},
    )
    started = client.post(
        "/api/v1/opsi/rollouts/cmp_v13roll01/start",
        headers={**_auth(token, "release_owner", subject="rel", idem="start"), "If-Match": "2"},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    handled = asyncio.run(state.rollouts.dispatch_once("w1"))
    assert handled >= 1
    campaign = asyncio.run(state.rollouts.store.get_campaign("cmp_v13roll01"))
    rb = client.post(
        "/api/v1/opsi/rollouts/cmp_v13roll01/rollback",
        headers={**_auth(token, "release_owner", idem="rb"), "If-Match": str(campaign.revision)},
        json={**REASON, "scope": "campaign"},
    )
    assert rb.status_code == 200, rb.text
    targets = asyncio.run(state.rollouts.store.list_targets("cmp_v13roll01"))
    queued = [item for item in targets if item.mutated]
    assert queued
    assert all(item.status == TargetStatus.ROLLBACK_QUEUED.value for item in queued)


def test_metrics_survive_without_process_counters(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v13met01",
            "name": "metrics",
            "clientIds": ["client-b.example", "client-a.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    metrics = client.get("/api/v1/opsi/rollouts/metrics", headers=_auth(token, "release_owner")).json()
    assert "DRAFT" in metrics["campaignsByStatus"]
    assert "hostname" not in str(metrics).lower()
    assert not hasattr(state.rollouts, "metric_counts")


def test_freeze_and_attestation_and_compliance(token):
    settings = Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32", pilot_start_enabled=True)
    state = build_test_state(settings)
    client = TestClient(create_app(state))
    frozen = client.post(
        "/api/v1/opsi/release-freezes",
        headers=_auth(token, "release_owner", idem="frz"),
        json={"freezeId": "frz_lab01", "cause": "secret_canary", **REASON},
    )
    assert frozen.status_code == 200, frozen.text
    now = datetime.now(UTC)
    attested = client.post(
        "/api/v1/opsi/depot-attestations",
        headers=_auth(token, "release_owner", idem="att"),
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
    assert attested.status_code == 200, attested.text
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", idem="cmp"),
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_v13comp01",
            "name": "compliance",
            "clientIds": ["client-b.example", "client-a.example"],
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": DIGEST,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            **REASON,
        },
    )
    assert created.status_code == 200, created.text
    compliance = client.get(
        "/api/v1/opsi/rollouts/cmp_v13comp01/compliance",
        headers=_auth(token, "release_owner"),
    )
    assert compliance.status_code == 200, compliance.text
    assert compliance.json()["items"]
    fleet = client.get("/api/v1/opsi/fleet/compliance", headers=_auth(token, "release_owner"))
    assert fleet.status_code == 200
    evidence = client.get(
        "/api/v1/opsi/rollouts/cmp_v13comp01/evidence",
        headers=_auth(token, "release_owner"),
    ).json()
    assert evidence["schema"] == "smc.opsi.evidence-manifest.v2"
    assert evidence["verification"] == "implemented"
    assert evidence["decision"] == "NO-GO"


def test_production_gate_seed_forbidden_in_production():
    settings = Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
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
    )
    try:
        asyncio.run(state.rollouts.seed_production_gate_for_test())
    except Exception as exc:
        assert "production" in str(exc).lower() or getattr(exc, "status_code", 0) == 403
    else:
        raise AssertionError("seed must fail in production env")


def test_openapi_includes_v13_paths():
    paths = create_app().openapi()["paths"]
    assert "/api/v1/opsi/rollouts/{campaign_id}/depots" in paths
    assert "/api/v1/opsi/rollouts/{campaign_id}/rings" in paths
    assert "/api/v1/opsi/depot-attestations" in paths
    assert "/api/v1/opsi/release-freezes" in paths
    assert "/api/v1/opsi/fleet/compliance" in paths
