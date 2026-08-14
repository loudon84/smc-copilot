from __future__ import annotations

from typing import Any

from core.errors import ErrorCode, OpsiControlError
from integrations.opsi_jsonrpc import OpsiJsonRpc
from schemas.models import CUSTOM_OPERATIONS, Operation


def opsi_action_for(operation: Operation) -> str:
    if operation in {Operation.SETUP, Operation.UPDATE, Operation.UNINSTALL}:
        return operation.value
    if operation in CUSTOM_OPERATIONS:
        return "custom"
    raise OpsiControlError(ErrorCode.VALIDATION_ERROR, f"unsupported operation: {operation}", status_code=400)


async def dispatch_target(
    *,
    rpc: OpsiJsonRpc,
    product_id: str,
    request_id: str,
    client_id: str,
    operation: Operation,
    hermes_version: str | None,
    config_revision: int | None,
    auto_repair_level: int | None,
) -> None:
    properties: list[dict[str, Any]] = [
        {"productId": product_id, "propertyId": "request_id", "objectId": client_id, "value": request_id},
    ]
    if operation in CUSTOM_OPERATIONS:
        properties.append(
            {"productId": product_id, "propertyId": "custom_operation", "objectId": client_id, "value": operation.value}
        )
    if hermes_version:
        properties.append(
            {"productId": product_id, "propertyId": "hermes_version", "objectId": client_id, "value": hermes_version}
        )
    if config_revision is not None:
        properties.append(
            {
                "productId": product_id,
                "propertyId": "config_revision",
                "objectId": client_id,
                "value": str(config_revision),
            }
        )
    if auto_repair_level is not None:
        properties.append(
            {
                "productId": product_id,
                "propertyId": "auto_repair_level",
                "objectId": client_id,
                "value": str(auto_repair_level),
            }
        )
    await rpc.call("productPropertyState_updateObjects", properties)
    verified = await rpc.call("productPropertyState_getObjects", {"objectId": client_id, "productId": product_id}, [])
    by_prop = {item.get("propertyId"): str(item.get("value") or "") for item in verified}
    if by_prop.get("request_id") != request_id:
        raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "property read-back mismatch", status_code=502)
    action = opsi_action_for(operation)
    await rpc.call(
        "productOnClient_updateObjects",
        [
            {
                "productId": product_id,
                "clientId": client_id,
                "actionRequest": action,
            }
        ],
    )
