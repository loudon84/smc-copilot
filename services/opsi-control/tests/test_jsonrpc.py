from __future__ import annotations

import pytest

from core.errors import ErrorCode, OpsiControlError
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
                "value": "status",
            },
            {
                "productId": "smc-hermes-agent",
                "propertyId": "custom_operation",
                "objectId": "client-b.example",
                "value": "diagnose",
            },
        ],
    )
    props = await rpc.call("productPropertyState_getObjects", {}, [])
    by_client = {item["objectId"]: item["value"] for item in props if item["propertyId"] == "custom_operation"}
    assert by_client["client-a.example"] == "status"
    assert by_client["client-b.example"] == "diagnose"


@pytest.mark.asyncio
async def test_unavailable():
    rpc = FakeOpsiJsonRpc()
    rpc.set_available(False)
    with pytest.raises(OpsiControlError) as exc:
        await rpc.call("host_getObjects")
    assert exc.value.code == ErrorCode.OPSI_UNAVAILABLE.value


def test_allowlist_fixed():
    assert "log_read" in ALLOWED_METHODS
    assert len(ALLOWED_METHODS) == 8
