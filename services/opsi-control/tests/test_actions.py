from __future__ import annotations

from core.auth import Scope
from integrations.opsi_jsonrpc import ALLOWED_METHODS, FakeOpsiJsonRpc


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
    replay = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert replay.status_code == 200
    conflict = client.post(
        "/api/v1/opsi/actions",
        json={**body, "operation": "diagnose"},
        headers=headers,
    )
    assert conflict.status_code == 409

    rpc: FakeOpsiJsonRpc = state.rpc
    props_a = [
        value
        for (product, prop, obj), value in rpc.properties.items()
        if obj == "client-a.example" and prop == "custom_operation"
    ]
    props_b = [
        value
        for (product, prop, obj), value in rpc.properties.items()
        if obj == "client-b.example" and prop == "custom_operation"
    ]
    assert props_a == ["status"]
    assert props_b == ["status"]
    assert rpc.properties[("smc-hermes-agent", "request_id", "client-a.example")] == "req_custom01"


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
        "targets": [{"clientId": "client-a.example"}, {"clientId": "client-b.example"}],
        "hermesVersion": "0.22.0",
    }
    resp = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert resp.status_code == 200
    payload = resp.json()
    by_client = {item["clientId"]: item["status"] for item in payload["targets"]}
    assert by_client["client-a.example"] == "DISPATCHED"
    assert by_client["client-b.example"] == "FAILED"


def test_rpc_allowlist():
    assert "host_getObjects" in ALLOWED_METHODS
    assert "execute" not in ALLOWED_METHODS
