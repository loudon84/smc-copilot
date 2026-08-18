from __future__ import annotations

import asyncio
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

from core.auth import Scope
from db.repositories.v2_store import ClientSnapshotRecord
from integrations.opsi_jsonrpc import FakeOpsiJsonRpc
from schemas.models import ActionStatus
from schemas.v2.models import V2Operation
from services.v2.action_utils import is_v2_action
from services.v2.artifact_token import mint_artifact_token, verify_artifact_token
from services.v2.artifact_token import ArtifactTokenClaims
from workers.command_dispatcher import COMMAND_TEMPLATES, command_for_action


def _v2_headers(token) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token(Scope.ACTION_DISPATCH.value, Scope.INVENTORY_READ.value, Scope.POLICY_APPLY.value)}"
    }


def test_v2_action_create_and_dispatch(client, token, state):
    headers = _v2_headers(token)
    body = {
        "schema": "smc.opsi.action-request.v2",
        "requestId": "req_v2status1",
        "operation": "status",
        "targets": [{"clientId": "client-a.example"}],
        "operator": "ops@example.com",
        "reason": "status probe",
    }
    created = client.post("/api/v2/opsi/actions", json=body, headers=headers)
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "QUEUED"
    asyncio.run(state.v2_actions.dispatch_once())
    view = client.get("/api/v2/opsi/actions/req_v2status1", headers=headers).json()
    assert view["targets"][0]["status"] in {"SUCCEEDED", "WAITING_CLIENT", "FAILED"}
    rpc: FakeOpsiJsonRpc = state.rpc
    assert any(call[0] == "hostControlSafe_execute" for call in rpc.calls)


def test_v2_command_templates_are_fixed():
    for operation, template in COMMAND_TEMPLATES.items():
        assert ";" not in template
        assert "|" not in template
        assert "powershell" not in template.lower() or operation in {
            V2Operation.CONFIG_APPLY,
            V2Operation.COLLECT_LOGS,
            V2Operation.COLLECT_SESSIONS,
            V2Operation.UPDATE,
            V2Operation.REPAIR,
        }


def test_v2_rejects_latest_update(client, token):
    headers = _v2_headers(token)
    resp = client.post(
        "/api/v2/opsi/actions",
        json={
            "schema": "smc.opsi.action-request.v2",
            "requestId": "req_v2update1",
            "operation": "update",
            "targets": [{"clientId": "client-a.example"}],
            "releaseVersion": "latest",
            "operator": "ops@example.com",
            "reason": "bad update",
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_v2_config_create_and_get(client, token, state):
    headers = _v2_headers(token)
    yaml_text = "gateway:\n  port: 8642\n"
    created = client.post(
        "/api/v2/opsi/configs",
        json={
            "schema": "smc.opsi.config-artifact.v2",
            "revision": 12,
            "contentYaml": yaml_text,
            "operator": "ops@example.com",
            "reason": "lab config",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    payload = created.json()
    assert payload["revision"] == 12
    assert payload["sha256"] == hashlib.sha256(yaml_text.encode("utf-8")).hexdigest()
    fetched = client.get("/api/v2/opsi/configs/12", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["artifactId"] == payload["artifactId"]


def test_v2_release_upsert(client, token):
    headers = _v2_headers(token)
    digest = "a" * 64
    created = client.post(
        "/api/v2/opsi/releases",
        json={
            "schema": "smc.opsi.hermes-release.v2",
            "releaseVersion": "0.22.0-smc.1",
            "hermesVersion": "0.22.0",
            "smcRevision": "smc.1",
            "sha256": digest,
            "manifestSha256": digest,
            "signerKeyId": "TEST-ONLY-ed25519",
            "liveEligible": False,
            "operator": "ops@example.com",
            "reason": "lab release",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    fetched = client.get("/api/v2/opsi/releases/0.22.0-smc.1", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["artifactId"]


def test_v2_artifact_token_binding(client, token, state):
    headers = _v2_headers(token)
    config = client.post(
        "/api/v2/opsi/configs",
        json={
            "schema": "smc.opsi.config-artifact.v2",
            "revision": 21,
            "contentYaml": "key: value\n",
            "operator": "ops@example.com",
            "reason": "token test",
        },
        headers=headers,
    ).json()
    minted = client.post(
        "/api/v2/opsi/artifacts/token",
        json={
            "artifactId": config["artifactId"],
            "clientId": "client-a.example",
            "requestId": "req_v2token1",
            "direction": "download",
        },
        headers=headers,
    )
    assert minted.status_code == 200, minted.text
    token_value = minted.json()["token"]
    verify_artifact_token(
        token_value,
        settings=state.settings,
        artifact_id=config["artifactId"],
        client_id="client-a.example",
        request_id="req_v2token1",
        direction="download",
    )
    with pytest.raises(Exception):
        verify_artifact_token(
            token_value,
            settings=state.settings,
            artifact_id=config["artifactId"],
            client_id="client-b.example",
            request_id="req_v2token1",
            direction="download",
        )


def test_v2_client_status(client, token, state):
    headers = _v2_headers(token)
    asyncio.run(
        state.v2_clients.put_snapshot(
            ClientSnapshotRecord(
                client_id="client-a.example",
                reachable=True,
                payload_json=json.dumps(
                    {
                        "hermes": {"installed": True, "version": "0.22.0", "releaseVersion": "0.22.0-smc.1"},
                        "gateway": {"state": "running", "port": 8642},
                        "config": {"revision": 12, "valid": True},
                    }
                ),
            )
        )
    )
    resp = client.get("/api/v2/opsi/clients/client-a.example/status", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["reachable"] is True
    assert body["hermes"]["installed"] is True


def test_v2_collect_logs_requires_limits(client, token):
    headers = _v2_headers(token)
    resp = client.post(
        "/api/v2/opsi/actions",
        json={
            "schema": "smc.opsi.action-request.v2",
            "requestId": "req_v2logs1",
            "operation": "collect-logs",
            "targets": [{"clientId": "client-a.example"}],
            "operator": "ops@example.com",
            "reason": "logs",
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_v2_group_target_resolution(client, token, state):
    headers = _v2_headers(token)
    body = {
        "schema": "smc.opsi.action-request.v2",
        "requestId": "req_v2grpstat1",
        "operation": "status",
        "targets": [{"clientId": "client-a.example"}],
        "groupId": "grp_lab_batch",
        "operator": "ops@example.com",
        "reason": "group probe",
    }
    created = client.post("/api/v2/opsi/actions", json=body, headers=headers)
    assert created.status_code == 200, created.text
    view = created.json()
    assert len(view["targets"]) == 3


def test_v2_batch_cancel(client, token, state):
    headers = _v2_headers(token)
    body = {
        "schema": "smc.opsi.action-request.v2",
        "requestId": "req_v2cancel1",
        "operation": "status",
        "targets": [{"clientId": "client-a.example"}, {"clientId": "client-b.example"}],
        "concurrency": 1,
        "operator": "ops@example.com",
        "reason": "cancel test",
    }
    created = client.post("/api/v2/opsi/actions", json=body, headers=headers)
    assert created.status_code == 200, created.text
    cancelled = client.post(
        "/api/v2/opsi/actions/req_v2cancel1/cancel",
        json={"reason": "operator cancel"},
        headers=headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "CANCELLED"


def test_v2_batch_status_aggregate(client, token, state):
    headers = _v2_headers(token)
    body = {
        "schema": "smc.opsi.action-request.v2",
        "requestId": "req_v2batch1",
        "operation": "status",
        "targets": [{"clientId": "client-a.example"}],
        "operator": "ops@example.com",
        "reason": "batch test",
    }
    client.post("/api/v2/opsi/actions", json=body, headers=headers)
    resp = client.get("/api/v2/opsi/actions/req_v2batch1/batch", headers=headers)
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["total"] == 1
    assert payload["status"] == "QUEUED"


def test_v2_action_stored_separately_from_v1_product(client, token, state):
    headers = _v2_headers(token)
    client.post(
        "/api/v2/opsi/actions",
        json={
            "schema": "smc.opsi.action-request.v2",
            "requestId": "req_v2gateway1",
            "operation": "gateway-restart",
            "targets": [{"clientId": "client-a.example"}],
            "operator": "ops@example.com",
            "reason": "restart gateway",
        },
        headers=headers,
    )
    action = asyncio.run(state.repos.actions.get("req_v2gateway1"))
    assert action is not None
    assert is_v2_action(action)
    rpc: FakeOpsiJsonRpc = state.rpc
    before = len(rpc.properties)
    asyncio.run(state.v2_actions.dispatch_once())
    assert len(rpc.properties) == before


def test_legacy_freeze_blocks_v1_product_mutation(token):
    from app import build_test_state, create_app
    from core.config import Settings

    frozen_settings = Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
        legacy_product_frozen=True,
    )
    frozen_state = build_test_state(frozen_settings)
    frozen_client = TestClient(create_app(frozen_state))
    headers = {
        "Authorization": f"Bearer {token(subject='ops', roles=['release_owner'])}",
    }
    resp = frozen_client.post(
        "/api/v1/opsi/actions",
        json={
            "requestId": "req_legacy_frz_1",
            "operation": "setup",
            "targets": [{"clientId": "client-a.example", "userBinding": {"sid": "S-1-5-21-1", "account": "a"}}],
            "hermesVersion": "0.22.0",
        },
        headers=headers,
    )
    assert resp.status_code == 410
    assert "frozen" in resp.json()["error"]["message"].lower()


def test_legacy_freeze_allows_v2_operations(token):
    from app import build_test_state, create_app
    from core.config import Settings

    frozen_settings = Settings(
        opsi_env="test",
        jwt_lab_secret="test-secret-test-secret-test-sec32",
        legacy_product_frozen=True,
    )
    frozen_state = build_test_state(frozen_settings)
    frozen_client = TestClient(create_app(frozen_state))
    headers = _v2_headers(token)
    resp = frozen_client.post(
        "/api/v2/opsi/actions",
        json={
            "schema": "smc.opsi.action-request.v2",
            "requestId": "req_v2frzok1",
            "operation": "status",
            "targets": [{"clientId": "client-a.example"}],
            "operator": "ops@example.com",
            "reason": "v2 still works",
        },
        headers=headers,
    )
    assert resp.status_code == 200


def test_v2_zero_product_write_rpcs():
    """Negative scan: v2 dispatch code must not reference Product write RPCs."""
    from pathlib import Path
    import re

    v2_paths = [
        Path("src/api/v2"),
        Path("src/workers/command_dispatcher.py"),
    ]
    product_write_re = re.compile(r"productPropertyState_updateObjects|productOnClient_updateObjects")
    base = Path(__file__).resolve().parents[1]
    hits = []
    for v2_path in v2_paths:
        full = base / v2_path
        if full.is_file():
            if product_write_re.search(full.read_text(encoding="utf-8")):
                hits.append(str(v2_path))
        elif full.is_dir():
            for f in full.rglob("*.py"):
                if product_write_re.search(f.read_text(encoding="utf-8")):
                    hits.append(str(f.relative_to(base)))
    assert hits == [], f"v2 Product write RPCs found: {hits}"
