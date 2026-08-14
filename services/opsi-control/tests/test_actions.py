from __future__ import annotations

import asyncio

from core.auth import Scope
from integrations.opsi_jsonrpc import ALLOWED_METHODS, FakeOpsiJsonRpc

BINDING_A = {"sid": "S-1-5-21-1-2-3-1001", "account": "lab\\user-a"}
BINDING_B = {"sid": "S-1-5-21-1-2-3-1002", "account": "lab\\user-b"}


def test_create_action_idempotent_and_isolated(client, token, state):
    headers = {"Authorization": f"Bearer {token(Scope.ACTION_DISPATCH.value, Scope.INVENTORY_READ.value)}"}
    body = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_custom01",
        "operation": "status",
        "targets": [{"clientId": "client-a.example"}, {"clientId": "client-b.example"}],
    }
    first = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "QUEUED"
    replay = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert replay.status_code == 200
    conflict = client.post(
        "/api/v1/opsi/actions",
        json={**body, "operation": "diagnose"},
        headers=headers,
    )
    assert conflict.status_code == 409

    rpc: FakeOpsiJsonRpc = state.rpc
    assert rpc.properties == {}
    asyncio.run(state.actions.dispatch_once())
    assert rpc.property_scalar("smc-hermes-agent", "custom_operation", "client-a.example") == "status"
    assert rpc.property_scalar("smc-hermes-agent", "custom_operation", "client-b.example") == "status"
    assert rpc.property_scalar("smc-hermes-agent", "request_id", "client-a.example") == "req_custom01"
    after = client.get("/api/v1/opsi/actions/req_custom01", headers=headers)
    by_client = {item["clientId"]: item["status"] for item in after.json()["targets"]}
    assert by_client["client-a.example"] == "DISPATCHED"
    assert by_client["client-b.example"] == "DISPATCHED"


def test_partial_target_failure_does_not_mark_other_success(client, token, state):
    headers = {"Authorization": f"Bearer {token(Scope.ACTION_DISPATCH.value, Scope.INVENTORY_READ.value)}"}
    original = state.rpc.call

    async def flaky(method, *params):
        if method == "productOnClient_updateObjects":
            objects = params[0]
            client_id = objects[0]["clientId"]
            if client_id == "client-b.example":
                from core.errors import ErrorCode, OpsiControlError

                raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "boom", status_code=503)
        return await original(method, *params)

    state.rpc.call = flaky  # type: ignore[method-assign]
    body = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_partial1",
        "operation": "setup",
        "targets": [
            {"clientId": "client-a.example", "userBinding": BINDING_A},
            {"clientId": "client-b.example", "userBinding": BINDING_B},
        ],
        "hermesVersion": "0.22.0",
    }
    resp = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "QUEUED"
    asyncio.run(state.actions.dispatch_once())
    payload = client.get("/api/v1/opsi/actions/req_partial1", headers=headers).json()
    by_client = {item["clientId"]: item["status"] for item in payload["targets"]}
    assert by_client["client-a.example"] == "DISPATCHED"
    assert by_client["client-b.example"] == "FAILED"
    assert payload["status"] == "DISPATCHED"


def test_setup_requires_user_binding(client, token):
    headers = {"Authorization": f"Bearer {token(Scope.ACTION_DISPATCH.value)}"}
    resp = client.post(
        "/api/v1/opsi/actions",
        json={
            "schema": "smc.opsi.action-request.v1",
            "requestId": "req_nouser01",
            "operation": "setup",
            "targets": [{"clientId": "client-a.example"}],
            "hermesVersion": "0.22.0",
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_rpc_allowlist():
    assert "host_getObjects" in ALLOWED_METHODS
    assert "execute" not in ALLOWED_METHODS
