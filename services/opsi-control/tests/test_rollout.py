from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import build_test_state, create_app
from core.config import Settings
from domain.snapshot import snapshot_digest, split_batches

DIGEST = "aa" * 32
CMP = "cmp_labpilot01"
REASON = {"reason": "pilot rollout lab", "changeTicket": "CHG-1201"}


@pytest.fixture
def rollout_settings() -> Settings:
    return Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
        pilot_start_enabled=True,
    )


@pytest.fixture
def rollout_state(rollout_settings):
    return build_test_state(rollout_settings)


@pytest.fixture
def rollout_client(rollout_state):
    return TestClient(create_app(rollout_state))


def _auth(token, *roles: str, subject: str = "ops", idem: str = "idem-create-1") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(subject=subject, roles=list(roles))}",
        "Idempotency-Key": idem,
    }


def _campaign_body(client_ids: list[str] | None = None) -> dict:
    return {
        "schema": "smc.opsi.rollout-campaign.v1",
        "campaignId": CMP,
        "name": "lab-pilot",
        "clientIds": client_ids or ["client-b.example", "client-a.example"],
        "productVersion": "0.22.0",
        "packageVersion": "1",
        "artifactDigest": DIGEST,
        "signerKeyId": "lab-signer",
        "configRevision": 1,
        **REASON,
    }


def _promote(client, token) -> None:
    resp = client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-promote-1"),
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
    assert resp.status_code == 200, resp.text


def test_snapshot_is_canonical_and_stable():
    left = ["client-b.example", "client-a.example"]
    right = ["client-a.example", "client-b.example", "client-a.example"]
    assert snapshot_digest(left) == snapshot_digest(right)
    batches = split_batches([f"h{i:02d}.example" for i in range(12)])
    assert batches[0][1] == ["h00.example", "h01.example"]
    assert batches[0][2] == 24
    assert len(batches[1][1]) == 5
    assert batches[1][2] == 6
    assert len(batches) == 3


def test_openapi_includes_rollout_paths():
    app = create_app()
    paths = app.openapi()["paths"]
    assert "/api/v1/opsi/rollouts" in paths
    assert "/api/v1/opsi/rollouts/{campaign_id}/start" in paths
    assert "/api/v1/opsi/artifacts/promote" in paths
    assert app.openapi()["info"]["version"] == "1.3.0"


def test_production_rejects_pilot_flag_without_go():
    with pytest.raises((ValueError, ValidationError)):
        Settings(
            opsi_env="production",
            jwt_lab_secret="prod-secret-not-lab",
            oidc_issuer="https://idp.example/realms/smc",
            oidc_jwks_url="https://idp.example/realms/smc/certs",
            opsi_rpc_url="https://opsi.example/rpc",
            opsi_rpc_username="u",
            opsi_rpc_password_ref="OPSI_RPC_PASSWORD",
            secret_provider_url="https://vault.example/v1/secret",
            pilot_start_enabled=True,
            pilot_live_gate="NO-GO",
        )


def test_start_without_live_gate_is_precondition(client, token):
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    revision = created.json()["revision"]
    started = client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 412
    assert "live gate" in started.json()["error"]["message"]


def test_start_rejects_self_reported_go(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner"), "If-Match": "1"},
        json={**REASON, "go": True},
    )
    assert started.status_code == 422


def test_forged_actor_rejected(rollout_client, token):
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json={**_campaign_body(), "actor": "forged"},
    )
    assert created.status_code == 422


def test_happy_path_dual_approval_canary_pause_rollback_evidence(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["status"] == "DRAFT"
    assert body["clientCount"] == 2
    assert body["batches"][0]["clientIds"] == ["client-a.example", "client-b.example"]
    assert body["batches"][0]["observeHours"] == 24
    replay = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json=_campaign_body(),
    )
    assert replay.status_code == 200
    assert replay.json()["campaignId"] == CMP
    stale = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "99"},
        json=REASON,
    )
    assert stale.status_code == 409
    pre = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "1"},
        json=REASON,
    )
    assert pre.status_code == 200, pre.text
    assert pre.json()["status"] == "AWAITING_APPROVAL"
    revision = pre.json()["revision"]
    alice = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    assert alice.status_code == 200, alice.text
    bob = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "endpoint_ops", subject="bob"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    assert bob.status_code == 200, bob.text
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "RUNNING"
    rollout_state.rollouts.facts["client-a.example"]["injectFailure"] = True
    handled = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w1"))
    assert handled >= 1
    paused = rollout_client.get(
        f"/api/v1/opsi/rollouts/{CMP}",
        headers=_auth(token, "release_owner"),
    )
    assert paused.json()["status"] == "PAUSED"
    assert paused.json()["pauseCause"] == "canary_failure"
    fenced = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w2"))
    assert fenced == 0
    targets = rollout_client.get(
        f"/api/v1/opsi/rollouts/{CMP}/targets",
        headers=_auth(token, "release_owner"),
    )
    ids = {item["clientId"] for item in targets.json()["items"]}
    assert "client-a" in ids
    assert "client-a.example" not in ids
    campaign = asyncio.run(rollout_state.rollouts.get(CMP))
    mutated = next(
        item
        for item in asyncio.run(rollout_state.rollouts.store.list_targets(CMP))
        if item.mutated or item.status == "FAILED"
    )
    mutated.mutated = True
    asyncio.run(rollout_state.rollouts.store.put_target(mutated))
    rb = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/rollback",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(campaign.revision)},
        json={**REASON, "scope": "campaign"},
    )
    assert rb.status_code == 200, rb.text
    evidence = rollout_client.get(
        f"/api/v1/opsi/rollouts/{CMP}/evidence",
        headers=_auth(token, "release_owner"),
    )
    assert evidence.status_code == 200
    payload = evidence.json()
    assert payload["verification"] == "implemented"
    assert payload["decision"] == "NO-GO"
    assert payload["redacted"] is True
    metrics = rollout_client.get("/api/v1/opsi/rollouts/metrics", headers=_auth(token, "release_owner"))
    dumped = str(metrics.json())
    assert "client-a.example" not in dumped
    assert "lab\\user" not in dumped


def test_creator_cannot_satisfy_both_roles(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    pre = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "1"},
        json=REASON,
    )
    revision = pre.json()["revision"]
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "endpoint_ops", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 403


def test_owner_conflict_blocks_approval(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    rollout_state.rollouts.facts["client-a.example"]["owner"] = "salt"
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    pre = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner"), "If-Match": str(created.json()["revision"])},
        json=REASON,
    )
    assert pre.json()["status"] == "DRAFT"
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner"), "If-Match": str(pre.json()["revision"])},
        json=REASON,
    )
    assert started.status_code in {400, 403}


def test_quarantine_pauses_active_campaign(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text
    pre = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "1"},
        json=REASON,
    )
    revision = pre.json()["revision"]
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "endpoint_ops", subject="bob"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    quarantined = rollout_client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-q"),
        json={
            "schema": "smc.opsi.artifact-promotion.v1",
            "productVersion": "0.22.0",
            "digest": DIGEST,
            "signerKeyId": "lab-signer",
            "fromChannel": "pilot",
            "toChannel": "quarantined",
            "evidenceRef": "test://quarantine",
            **REASON,
        },
    )
    assert quarantined.status_code == 200, quarantined.text
    current = rollout_client.get(f"/api/v1/opsi/rollouts/{CMP}", headers=_auth(token, "release_owner"))
    assert current.json()["status"] == "PAUSED"
    assert current.json()["pauseCause"] == "artifact_conflict"


def test_stable_promotion_rejected(rollout_client, token):
    resp = rollout_client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-stable"),
        json={
            "schema": "smc.opsi.artifact-promotion.v1",
            "productVersion": "0.22.0",
            "digest": DIGEST,
            "signerKeyId": "lab-signer",
            "fromChannel": "pilot",
            "toChannel": "stable",
            "evidenceRef": "test://no",
            **REASON,
        },
    )
    assert resp.status_code == 412


def test_feature_flag_blocks_start_even_with_go(client, token, state):
    asyncio.run(state.rollouts.seed_live_gate_for_test())
    _promote(client, token)
    created = client.post("/api/v1/opsi/rollouts", headers=_auth(token, "release_owner"), json=_campaign_body())
    assert created.status_code == 200, created.text
    pre = client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner"), "If-Match": "1"},
        json=REASON,
    )
    revision = pre.json()["revision"]
    client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "endpoint_ops", subject="bob"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    started = client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 412
    assert "feature flag" in started.json()["error"]["message"]


def _start_campaign(client, token, state, campaign_id: str = CMP) -> int:
    asyncio.run(state.rollouts.seed_live_gate_for_test())
    _promote(client, token)
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice", idem=f"idem-{campaign_id}"),
        json={**_campaign_body(), "campaignId": campaign_id},
    )
    assert created.status_code == 200, created.text
    pre = client.post(
        f"/api/v1/opsi/rollouts/{campaign_id}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "1"},
        json=REASON,
    )
    revision = pre.json()["revision"]
    client.post(
        f"/api/v1/opsi/rollouts/{campaign_id}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    client.post(
        f"/api/v1/opsi/rollouts/{campaign_id}/approve",
        headers={**_auth(token, "endpoint_ops", subject="bob"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    started = client.post(
        f"/api/v1/opsi/rollouts/{campaign_id}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    return started.json()["revision"]


def test_abort_does_not_implicitly_rollback(rollout_client, token, rollout_state):
    revision = _start_campaign(rollout_client, token, rollout_state)
    aborted = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/abort",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "rollbackMutated": False},
    )
    assert aborted.status_code == 200, aborted.text
    assert aborted.json()["status"] == "ABORTED"
    targets = asyncio.run(rollout_state.rollouts.store.list_targets(CMP))
    assert all(item.status != "ROLLED_BACK" for item in targets)


def test_maintenance_window_blocks_new_dispatch(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    past = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    ended = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json={**_campaign_body(), "windowStart": past, "windowEnd": ended},
    )
    assert created.status_code == 200, created.text
    pre = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/preflight",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": "1"},
        json=REASON,
    )
    revision = pre.json()["revision"]
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/approve",
        headers={**_auth(token, "endpoint_ops", subject="bob"), "If-Match": str(revision)},
        json={**REASON, "kind": "start"},
    )
    started = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/start",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert started.status_code == 200, started.text
    handled = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w1"))
    assert handled == 0


def test_lease_blocks_second_worker_until_expiry(rollout_state):
    async def _run() -> None:
        store = rollout_state.rollouts.store
        assert await store.claim_orchestrator("w1", 1)
        assert await store.claim_orchestrator("w2", 1) is False
        store.lease_until = datetime.now(UTC) - timedelta(seconds=1)
        assert await store.claim_orchestrator("w2", 2)

    asyncio.run(_run())


def test_duplicate_active_client_rejected(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    first = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice"),
        json=_campaign_body(),
    )
    assert first.status_code == 200, first.text
    second = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", subject="alice", idem="idem-other"),
        json={**_campaign_body(), "campaignId": "cmp_labpilot02"},
    )
    assert second.status_code == 409


def test_idempotency_mismatch_conflicts(rollout_client, token):
    first = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", idem="idem-same"),
        json=_campaign_body(),
    )
    assert first.status_code == 200, first.text
    conflict = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner", idem="idem-same"),
        json={**_campaign_body(), "name": "other-name"},
    )
    assert conflict.status_code == 409


def test_same_version_different_digest_rejected(rollout_client, token, rollout_state):
    asyncio.run(rollout_state.rollouts.seed_live_gate_for_test())
    _promote(rollout_client, token)
    other = rollout_client.post(
        "/api/v1/opsi/artifacts/promote",
        headers=_auth(token, "release_owner", idem="idem-digest-2"),
        json={
            "schema": "smc.opsi.artifact-promotion.v1",
            "productVersion": "0.22.0",
            "digest": "bb" * 32,
            "signerKeyId": "lab-signer",
            "fromChannel": "testing",
            "toChannel": "pilot",
            "evidenceRef": "test://other",
            **REASON,
        },
    )
    assert other.status_code == 409


def test_secret_canary_pauses_campaign(rollout_client, token, rollout_state):
    _start_campaign(rollout_client, token, rollout_state)
    rollout_state.rollouts.facts["client-a.example"]["secretCanary"] = True
    handled = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w1"))
    assert handled >= 1
    current = rollout_client.get(f"/api/v1/opsi/rollouts/{CMP}", headers=_auth(token, "release_owner"))
    assert current.json()["status"] == "PAUSED"
    assert current.json()["pauseCause"] == "secret_canary"


def test_resume_requires_dual_approval(rollout_client, token, rollout_state):
    revision = _start_campaign(rollout_client, token, rollout_state)
    paused = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/pause",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json={**REASON, "cause": "p0_p1"},
    )
    assert paused.status_code == 200, paused.text
    revision = paused.json()["revision"]
    resumed = rollout_client.post(
        f"/api/v1/opsi/rollouts/{CMP}/resume",
        headers={**_auth(token, "release_owner", subject="alice"), "If-Match": str(revision)},
        json=REASON,
    )
    assert resumed.status_code == 403


def test_outbox_records_create_event(rollout_client, token, rollout_state):
    created = rollout_client.post(
        "/api/v1/opsi/rollouts",
        headers=_auth(token, "release_owner"),
        json=_campaign_body(),
    )
    assert created.status_code == 200, created.text

    async def _outbox() -> int:
        return len(await rollout_state.rollouts.store.unpublished_outbox())

    assert asyncio.run(_outbox()) >= 1


def test_restart_does_not_duplicate_dispatched_target(rollout_client, token, rollout_state):
    _start_campaign(rollout_client, token, rollout_state)
    first = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w1"))
    assert first >= 1
    campaign = asyncio.run(rollout_state.rollouts.get(CMP))
    if campaign.status == "RUNNING":
        second = asyncio.run(rollout_state.rollouts.dispatch_once("rollout-w1"))
        assert second == 0
    targets = asyncio.run(rollout_state.rollouts.store.list_targets(CMP))
    ids = [item.action_id for item in targets if item.action_id]
    assert len(ids) == len(set(ids))
