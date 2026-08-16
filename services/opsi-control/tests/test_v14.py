from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import build_lab_state, build_production_state, build_test_state, create_app
from core.auth import Scope
from core.config import Settings
from core.errors import OpsiControlError
from db.repositories.interfaces import ActionRecord, TargetRecord
from domain.collector import InventoryCollector, MemoryInventoryStore
from domain.inventory import BaselineKind, classify_baseline, load_inventory, snapshot_from_parts
from domain.policy import ACCELERATED_V14, LEGACY_V12, PRODUCTION_REENTRY_GATE, satisfies_v14_gate
from integrations.opsi_http import HttpOpsiJsonRpc
from schemas.models import ActionStatus, Operation
from schemas.rollout import RolloutCreateRequest
from workers.result_reconciler import parse_result_marker, reconcile_open


def test_test_assembly_is_fake_and_memory():
    state = build_test_state()
    assert type(state.rpc).__name__.startswith("Fake")
    assert type(state.repos.actions).__name__.startswith("Memory")
    app = create_app(state)
    with TestClient(app) as client:
        body = client.get("/ready").json()
    assert body["rpcBackend"] == "fake"
    assert body["persistence"] == "memory"


def test_lab_builder_rejects_cross_assembly():
    with pytest.raises(ValueError):
        build_lab_state(Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32"))
    with pytest.raises(ValueError):
        build_lab_state(
            Settings(
                opsi_env="lab",
                opsi_rpc_url="https://opsi.example/rpc",
                database_url="sqlite+aiosqlite:///:memory:",
            )
        )


def test_lab_requires_https_rpc():
    with pytest.raises(ValueError, match="https"):
        Settings(opsi_env="lab", opsi_rpc_url="http://opsi.example/rpc").assert_lab_safe()


def test_production_builder_rejects_test_env():
    with pytest.raises(ValueError):
        build_production_state(Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32"))


def test_http_rpc_posts_to_https_client():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"opsiVersion": "4.3"}})

    settings = Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
        opsi_rpc_url="https://opsi.example/rpc",
        opsi_rpc_username="lab",
        opsi_rpc_password="secret",
        opsi_rpc_ca_bundle="",
    )
    transport = httpx.MockTransport(handler)
    rpc = HttpOpsiJsonRpc(settings, client=httpx.AsyncClient(transport=transport))
    result = asyncio.run(rpc.call("backend_info"))
    assert result["opsiVersion"] == "4.3"
    assert calls and calls[0].startswith("https://")


def test_facts_are_not_an_inventory_source():
    state = build_test_state()
    loaded = asyncio.run(
        load_inventory(rpc=state.rpc, client_id="client-a.example", facts={"client-a.example": {"os": "windows11"}})
    )
    assert loaded is None


def test_collector_builds_snapshot_without_seeded_defaults():
    state = build_test_state()
    store = MemoryInventoryStore()
    collector = InventoryCollector(state.rpc, store)
    empty = asyncio.run(collector.refresh("client-a.example"))
    assert empty is None
    asyncio.run(
        store.put_binding(
            state.inventory_store.bindings["client-a.example"],
        )
    )
    asyncio.run(
        store.put_evidence(
            "client-a.example",
            {
                "os": "windows11",
                "lastSeenMinutes": 3,
                "owner": "",
                "diskFreeMb": 2048,
                "gatewayHealthy": False,
            },
        )
    )
    snap = asyncio.run(collector.refresh("client-a.example"))
    assert snap is not None
    assert snap.baseline_kind == BaselineKind.ABSENT.value
    assert snap.owner == ""
    assert snap.content_digest


def test_baseline_conflict_and_installed():
    assert classify_baseline(owner="salt", previous_version="", previous_digest="") == BaselineKind.CONFLICT.value
    assert (
        classify_baseline(owner="opsi", previous_version="0.21.0", previous_digest="ab" * 32)
        == BaselineKind.INSTALLED.value
    )
    assert classify_baseline(owner="direct", previous_version="", previous_digest="") == BaselineKind.ABSENT.value


def test_accelerated_policy_is_v14_gate_and_legacy_is_not():
    assert satisfies_v14_gate(ACCELERATED_V14)
    assert not satisfies_v14_gate(LEGACY_V12)
    with pytest.raises(ValidationError):
        RolloutCreateRequest.model_validate(
            {
                "reason": "too small",
                "changeTicket": "CHG-14",
                "campaignId": "cmp_toosmall2",
                "name": "two",
                "clientIds": ["a.example", "b.example"],
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "artifactDigest": "aa" * 32,
                "signerKeyId": "lab-signer",
                "configRevision": 1,
            }
        )


def test_production_start_frozen_without_reentry_go(token):
    state = build_test_state()
    with pytest.raises(OpsiControlError) as exc:
        asyncio.run(state.rollouts._assert_live_gate(PRODUCTION_REENTRY_GATE))
    assert exc.value.status_code == 412
    assert PRODUCTION_REENTRY_GATE in str(exc.value)

    now = datetime.now(UTC)
    template = state.inventory_store.bindings["client-a.example"]
    evidence = dict(state.inventory_store.evidence["client-a.example"])
    ids = [f"h{i:03d}.example" for i in range(21)]
    for client_id in ids:
        state.rpc.hosts.append(
            {"id": client_id, "type": "OpsiClient", "description": "windows11", "lastSeenMinutes": 5}
        )
        state.rpc.depot_mapping[client_id] = "depot.example"
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
            rpc_host={"description": "windows11", "lastSeenMinutes": 5},
            depot_id="depot.example",
            binding=binding,
            evidence=evidence,
            now=now,
        )
        assert snap is not None
        state.inventory_store.snapshots[client_id] = snap

    client = TestClient(create_app(state))
    headers = {
        "Authorization": f"Bearer {token(subject='ops', roles=['release_owner'])}",
        "Idempotency-Key": "idem-prod-freeze",
    }
    created = client.post(
        "/api/v1/opsi/rollouts",
        headers=headers,
        json={
            "schema": "smc.opsi.rollout-campaign.v1",
            "campaignId": "cmp_prodfreeze1",
            "name": "production-frozen",
            "mode": "production",
            "clientIds": ids,
            "productVersion": "0.22.0",
            "packageVersion": "1",
            "artifactDigest": "aa" * 32,
            "signerKeyId": "lab-signer",
            "configRevision": 1,
            "reason": "production start must stay frozen",
            "changeTicket": "CHG-1400",
        },
    )
    assert created.status_code == 200, created.text
    started = client.post(
        "/api/v1/opsi/rollouts/cmp_prodfreeze1/start",
        headers={**headers, "If-Match": "1"},
        json={"reason": "should fail", "changeTicket": "CHG-1400"},
    )
    assert started.status_code == 412
    assert PRODUCTION_REENTRY_GATE in started.json()["error"]["message"]


def test_stable_promotion_requires_reentry_go(token):
    state = build_test_state()
    client = TestClient(create_app(state))
    resp = client.post(
        "/api/v1/opsi/artifacts/promote",
        headers={
            "Authorization": f"Bearer {token(subject='ops', roles=['release_owner'])}",
            "Idempotency-Key": "idem-stable-v14",
        },
        json={
            "schema": "smc.opsi.artifact-promotion.v1",
            "productVersion": "0.22.0",
            "digest": "aa" * 32,
            "signerKeyId": "lab-signer",
            "fromChannel": "pilot",
            "toChannel": "stable",
            "evidenceRef": "test://no",
            "reason": "stable frozen",
            "changeTicket": "CHG-1401",
        },
    )
    assert resp.status_code == 412


def test_binding_rejects_forged_actor(client, token):
    headers = {"Authorization": f"Bearer {token(Scope.INVENTORY_WRITE.value)}"}
    resp = client.put(
        "/api/v1/opsi/clients/client-a.example/binding",
        headers=headers,
        json={
            "userSid": "S-1-5-21-1-2-3-1001",
            "userAccount": "lab\\user-a",
            "evidenceRef": "ticket://bind",
            "reason": "bind user",
            "changeTicket": "CHG-BIND",
            "actor": "forged",
        },
    )
    assert resp.status_code == 422


def test_inventory_evidence_roundtrip(client, token):
    headers = {"Authorization": f"Bearer {token(Scope.INVENTORY_WRITE.value, Scope.INVENTORY_READ.value)}"}
    put = client.put(
        "/api/v1/opsi/clients/client-a.example/inventory-evidence",
        headers=headers,
        json={
            "os": "windows10",
            "lastSeenMinutes": 4,
            "owner": "",
            "diskFreeMb": 1024,
            "gatewayHealthy": False,
        },
    )
    assert put.status_code == 200, put.text
    assert put.json()["baselineKind"] == "ABSENT"
    got = client.get("/api/v1/opsi/clients/client-a.example/inventory-evidence", headers=headers)
    assert got.status_code == 200
    assert got.json()["contentDigest"] == put.json()["contentDigest"]
    assert "lab\\user-a" not in str(got.json())


def test_expired_snapshot_is_not_authoritative():
    state = build_test_state()
    snap = state.inventory_store.snapshots["client-a.example"]
    expired = snapshot_from_parts(
        client_id=snap.client_id,
        rpc_host={"description": snap.os, "lastSeenMinutes": snap.last_seen_minutes},
        depot_id=snap.depot_id,
        binding=state.inventory_store.bindings[snap.client_id],
        evidence={
            "os": snap.os,
            "lastSeenMinutes": snap.last_seen_minutes,
            "owner": snap.owner,
            "diskFreeMb": snap.disk_free_mb,
            "userSid": snap.user_sid,
            "userAccount": snap.user_account,
            "gatewayHealthy": snap.gateway_healthy,
            "previousVersion": snap.previous_version,
            "previousDigest": snap.previous_digest,
        },
        now=datetime.now(UTC) - timedelta(hours=2),
    )
    assert expired is not None
    state.inventory_store.snapshots[snap.client_id] = expired
    loaded = asyncio.run(state.inventory_store.get_snapshot(snap.client_id))
    assert loaded is None


def test_continuation_marker_relays_parent(state):
    sha = "ab" * 32
    parent = "req_setup0001"
    poll = "req_poll_setup0001"
    log = (
        f"SMC_ACTION_RESULT request_id={poll} client_id=client-a.example "
        f"sha256={sha} status=SUCCEEDED bytes=12 redacted=true "
        f"parent_request_id={parent} result_kind=continuation content_sha256={sha}\n"
    )
    marker = parse_result_marker(log, poll, "client-a.example")
    assert marker is not None
    assert marker["parent_request_id"] == parent
    assert marker["result_kind"] == "continuation"

    now = datetime.now(UTC)

    asyncio.run(
        state.repos.actions.put(
            ActionRecord(
                request_id=parent,
                operation=Operation.SETUP,
                payload_digest="aa" * 32,
                status=ActionStatus.RUNNING,
                actor_id="ops",
                created_at=now,
                updated_at=now,
                deadline=now + timedelta(hours=1),
            )
        )
    )
    asyncio.run(
        state.repos.targets.put(
            TargetRecord(request_id=parent, client_id="client-a.example", status=ActionStatus.RUNNING)
        )
    )
    asyncio.run(
        state.repos.actions.put(
            ActionRecord(
                request_id=poll,
                operation=Operation.STATUS,
                payload_digest="bb" * 32,
                status=ActionStatus.DISPATCHED,
                actor_id="continuation-relay",
                created_at=now,
                updated_at=now,
                deadline=now + timedelta(hours=1),
            )
        )
    )
    asyncio.run(
        state.repos.targets.put(
            TargetRecord(request_id=poll, client_id="client-a.example", status=ActionStatus.DISPATCHED)
        )
    )
    state.rpc.put_result_log("client-a.example", poll, "SUCCEEDED", sha)
    state.rpc.logs["client-a.example"] = log
    handled = asyncio.run(reconcile_open(state.repos, state.rpc, "smc-hermes-agent"))
    assert handled >= 1
    parent_action = asyncio.run(state.repos.actions.get(parent))
    assert parent_action is not None
    targets = asyncio.run(state.repos.targets.list_for_request(parent))
    assert targets[0].status == ActionStatus.SUCCEEDED


def test_pending_schedules_status_poll(state):
    now = datetime.now(UTC)
    request_id = "req_setuppend1"
    sha = "cd" * 32
    asyncio.run(
        state.repos.actions.put(
            ActionRecord(
                request_id=request_id,
                operation=Operation.SETUP,
                payload_digest="cc" * 32,
                status=ActionStatus.RUNNING,
                actor_id="ops",
                created_at=now,
                updated_at=now,
                deadline=now + timedelta(hours=1),
            )
        )
    )
    asyncio.run(
        state.repos.targets.put(
            TargetRecord(request_id=request_id, client_id="client-b.example", status=ActionStatus.RUNNING)
        )
    )
    state.rpc.logs["client-b.example"] = (
        f"SMC_ACTION_RESULT request_id={request_id} client_id=client-b.example "
        f"sha256={sha} status=RUNNING bytes=20 redacted=true\nUSER_CONTEXT_PENDING\n"
    )
    asyncio.run(reconcile_open(state.repos, state.rpc, "smc-hermes-agent"))
    poll = asyncio.run(state.repos.actions.get("req_poll_setuppend1"))
    assert poll is not None
    assert poll.operation == Operation.STATUS


def test_v14_evidence_file_stays_nogo():
    text = Path(__file__).resolve().parents[3].joinpath("docs/opsi/evidence/v1.4/STATUS.md").read_text(encoding="utf-8")
    assert "not_proven" in text
    assert "NO-GO" in text
    assert "proven" in text.lower()
    assert "Operator signoff only" in text
