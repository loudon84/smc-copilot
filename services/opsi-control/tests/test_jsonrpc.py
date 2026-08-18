from __future__ import annotations

import pytest

from core.errors import ErrorCode, OpsiControlError
from integrations.dto import host_control_from_wire
from integrations.opsi_jsonrpc import ALLOWED_METHODS, FakeOpsiJsonRpc


@pytest.mark.asyncio
async def test_denied_rpc():
    rpc = FakeOpsiJsonRpc()
    with pytest.raises(OpsiControlError) as exc:
        await rpc.call("bogus_method")
    assert exc.value.code == ErrorCode.OPSI_RPC_DENIED.value


@pytest.mark.asyncio
async def test_property_isolation_two_clients():
    rpc = FakeOpsiJsonRpc()
    await rpc.call(
        "productPropertyState_updateObjects",
        [
            {
                "productId": "smc-hermes-agent",
                "propertyId": "custom_operation",
                "objectId": "client-a.example",
                "values": ["status"],
            },
            {
                "productId": "smc-hermes-agent",
                "propertyId": "custom_operation",
                "objectId": "client-b.example",
                "values": ["diagnose"],
            },
        ],
    )
    props = await rpc.call("productPropertyState_getObjects", {}, [])
    by_client = {item["objectId"]: item["values"][0] for item in props if item["propertyId"] == "custom_operation"}
    assert by_client["client-a.example"] == "status"
    assert by_client["client-b.example"] == "diagnose"
    assert all("value" not in item or "values" in item for item in props)


@pytest.mark.asyncio
async def test_log_read_instlog_shape():
    rpc = FakeOpsiJsonRpc()
    rpc.put_result_log("client-a.example", "req_labfix01", "SUCCEEDED", "ab" * 32)
    body = await rpc.call("log_read", "instlog", "client-a.example", 1024)
    assert "SMC_ACTION_RESULT" in body
    assert "req_labfix01" in body


@pytest.mark.asyncio
async def test_unavailable():
    rpc = FakeOpsiJsonRpc()
    rpc.set_available(False)
    with pytest.raises(OpsiControlError) as exc:
        await rpc.call("host_getObjects")
    assert exc.value.code == ErrorCode.OPSI_UNAVAILABLE.value


def test_allowlist_fixed():
    assert "log_read" in ALLOWED_METHODS
    assert "configState_getObjects" in ALLOWED_METHODS
    assert "hostControlSafe_reachable" in ALLOWED_METHODS
    assert "hostControlSafe_execute" in ALLOWED_METHODS
    assert "hostControlSafe_opsiclientdRpc" not in ALLOWED_METHODS
    assert "hostControlSafe_getActiveSessions" not in ALLOWED_METHODS
    assert len(ALLOWED_METHODS) == 13
    assert "group_getObjects" in ALLOWED_METHODS
    assert "objectToGroup_getObjects" in ALLOWED_METHODS


@pytest.mark.asyncio
async def test_hostcontrol_single_client_reachable_and_execute_shape():
    rpc = FakeOpsiJsonRpc()
    reachable = await rpc.call("hostControlSafe_reachable", ["client-a.example"])
    outcome = host_control_from_wire("hostControlSafe_reachable", "client-a.example", reachable)
    assert outcome.success is True
    assert outcome.reachable is True
    executed = await rpc.call(
        "hostControlSafe_execute",
        '"D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe" --version',
        ["client-a.example"],
    )
    result = host_control_from_wire("hostControlSafe_execute", "client-a.example", executed)
    assert result.success is True
    assert result.stdout
    assert result.error == ""


@pytest.mark.asyncio
async def test_hostcontrol_rejects_wildcard_and_batch_host_ids():
    rpc = FakeOpsiJsonRpc()
    with pytest.raises(OpsiControlError) as wildcard:
        await rpc.call("hostControlSafe_reachable", ["*"])
    assert wildcard.value.code == ErrorCode.OPSI_RPC_DENIED.value
    with pytest.raises(OpsiControlError) as batch:
        await rpc.call("hostControlSafe_execute", "whoami", ["client-a.example", "client-b.example"])
    assert batch.value.code == ErrorCode.OPSI_RPC_DENIED.value
    with pytest.raises(OpsiControlError) as empty:
        await rpc.call("hostControlSafe_reachable", [])
    assert empty.value.code == ErrorCode.OPSI_RPC_DENIED.value


@pytest.mark.asyncio
async def test_hostcontrol_opsiclientd_rpc_denied():
    rpc = FakeOpsiJsonRpc()
    with pytest.raises(OpsiControlError) as exc:
        await rpc.call("hostControlSafe_opsiclientdRpc", "execute", ["whoami"], ["client-a.example"])
    assert exc.value.code == ErrorCode.OPSI_RPC_DENIED.value
