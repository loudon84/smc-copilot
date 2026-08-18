from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from core.auth import Scope
from integrations.opsi_jsonrpc import ALLOWED_METHODS, FakeOpsiJsonRpc
from schemas.models import ActionStatus

HERMES_VERSION_COMMAND = '"D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe" --version'

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
    assert "hostControlSafe_opsiclientdRpc" not in ALLOWED_METHODS


def _action_headers(token):
    return {"Authorization": f"Bearer {token(Scope.ACTION_DISPATCH.value, Scope.INVENTORY_READ.value)}"}


def test_version_uses_hostcontrol_not_product_lifecycle(client, token, state):
    headers = _action_headers(token)
    body = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_version01",
        "operation": "version",
        "targets": [{"clientId": "client-a.example"}],
        "command": "whoami",
        "path": "C:\\\\Windows\\\\System32\\\\cmd.exe",
    }
    created = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert created.status_code == 422

    body.pop("command")
    body.pop("path")
    first = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert first.status_code == 200, first.text
    replay = client.post("/api/v1/opsi/actions", json=body, headers=headers)
    assert replay.status_code == 200
    conflict = client.post("/api/v1/opsi/actions", json={**body, "note": "other"}, headers=headers)
    assert conflict.status_code == 409

    rpc: FakeOpsiJsonRpc = state.rpc
    asyncio.run(state.actions.dispatch_once())
    methods = [method for method, _params in rpc.calls]
    assert methods == ["hostControlSafe_reachable", "hostControlSafe_execute"]
    execute_params = next(params for method, params in rpc.calls if method == "hostControlSafe_execute")
    assert execute_params[0] == HERMES_VERSION_COMMAND
    assert execute_params[1] == ["client-a.example"]
    assert rpc.properties == {}
    assert rpc.product_on_client == {}
    after = client.get("/api/v1/opsi/actions/req_version01", headers=headers).json()
    assert after["status"] == "SUCCEEDED"
    assert after["targets"][0]["status"] == "SUCCEEDED"
    results = client.get("/api/v1/opsi/actions/req_version01/results", headers=headers).json()["items"]
    assert results[0]["status"] == "SUCCEEDED"
    assert results[0]["redacted"] is True
    assert results[0]["sha256"]
    assert "0.22.0-smc.1" in (results[0]["message"] or "")


def test_version_partial_target_failure_does_not_mark_other_success(client, token, state):
    headers = _action_headers(token)
    state.rpc.execute_error["client-b.example"] = "cli failed"
    body = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_verpart1",
        "operation": "version",
        "targets": [{"clientId": "client-a.example"}, {"clientId": "client-b.example"}],
    }
    assert client.post("/api/v1/opsi/actions", json=body, headers=headers).status_code == 200
    asyncio.run(state.actions.dispatch_once())
    payload = client.get("/api/v1/opsi/actions/req_verpart1", headers=headers).json()
    by_client = {item["clientId"]: item["status"] for item in payload["targets"]}
    assert by_client["client-a.example"] == "SUCCEEDED"
    assert by_client["client-b.example"] == "FAILED"
    assert payload["status"] == "FAILED"


def test_version_offline_waits_then_unknown_on_deadline(client, token, state):
    headers = _action_headers(token)
    rpc: FakeOpsiJsonRpc = state.rpc
    rpc.host_reachable["client-a.example"] = False
    body = {
        "schema": "smc.opsi.action-request.v1",
        "requestId": "req_veroff01",
        "operation": "version",
        "targets": [{"clientId": "client-a.example"}],
    }
    assert client.post("/api/v1/opsi/actions", json=body, headers=headers).status_code == 200
    asyncio.run(state.actions.dispatch_once())
    waiting = client.get("/api/v1/opsi/actions/req_veroff01", headers=headers).json()
    assert waiting["status"] == ActionStatus.WAITING_CLIENT.value
    assert waiting["targets"][0]["status"] == ActionStatus.WAITING_CLIENT.value
    assert waiting["targets"][0]["errorCode"] == "CLIENT_OFFLINE"
    assert [method for method, _params in rpc.calls] == ["hostControlSafe_reachable"]

    calls_after_wait = len(rpc.calls)
    asyncio.run(state.actions.dispatch_once())
    assert len(rpc.calls) == calls_after_wait

    target = asyncio.run(state.repos.targets.list_for_request("req_veroff01"))[0]
    target.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    asyncio.run(state.repos.targets.put(target))
    asyncio.run(state.actions.dispatch_once())
    retried = client.get("/api/v1/opsi/actions/req_veroff01", headers=headers).json()
    assert retried["status"] == ActionStatus.WAITING_CLIENT.value
    assert retried["targets"][0]["status"] != "FAILED"
    methods = [method for method, _params in rpc.calls]
    assert methods.count("hostControlSafe_reachable") == 2
    assert "hostControlSafe_execute" not in methods

    action = asyncio.run(state.repos.actions.get("req_veroff01"))
    assert action is not None
    action.deadline = datetime.now(UTC) - timedelta(seconds=1)
    asyncio.run(state.repos.actions.put(action))
    expired = asyncio.run(state.repos.targets.list_for_request("req_veroff01"))[0]
    expired.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    asyncio.run(state.repos.targets.put(expired))
    asyncio.run(state.actions.dispatch_once())
    done = client.get("/api/v1/opsi/actions/req_veroff01", headers=headers).json()
    assert done["status"] == "UNKNOWN"
    assert done["targets"][0]["status"] == "UNKNOWN"
    assert done["targets"][0]["errorCode"] == "CLIENT_OFFLINE"
    assert "hostControlSafe_execute" not in [method for method, _params in rpc.calls]
