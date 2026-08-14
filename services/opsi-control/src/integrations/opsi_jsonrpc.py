from __future__ import annotations

from typing import Any, Protocol

from core.errors import ErrorCode, OpsiControlError

ALLOWED_METHODS = frozenset(
    {
        "backend_info",
        "host_getObjects",
        "productOnDepot_getObjects",
        "productOnClient_getObjects",
        "productOnClient_updateObjects",
        "productPropertyState_getObjects",
        "productPropertyState_updateObjects",
        "log_read",
    }
)


class OpsiJsonRpc(Protocol):
    async def call(self, method: str, *params: Any) -> Any: ...

    async def ready(self) -> bool: ...


class FakeOpsiJsonRpc:
    """In-memory opsiconfd stand-in for lab/test. Never used in production."""

    def __init__(self) -> None:
        self.hosts: list[dict[str, Any]] = [
            {"id": "client-a.example", "type": "OpsiClient", "description": "lab-a"},
            {"id": "client-b.example", "type": "OpsiClient", "description": "lab-b"},
        ]
        self.products: list[dict[str, Any]] = [
            {
                "productId": "smc-hermes-agent",
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "depotId": "depot.example",
            }
        ]
        self.product_on_client: dict[str, dict[str, Any]] = {}
        self.properties: dict[tuple[str, str, str], str] = {}
        self.logs: dict[str, str] = {}
        self._available = True
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    @property
    def available(self) -> bool:
        return self._available

    def set_available(self, value: bool) -> None:
        self._available = value

    async def ready(self) -> bool:
        return self._available

    async def call(self, method: str, *params: Any) -> Any:
        if method not in ALLOWED_METHODS:
            raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)
        if not self._available:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc unavailable", status_code=503)
        self.calls.append((method, params))
        if method == "backend_info":
            return {"opsiVersion": "4.3-fake"}
        if method == "host_getObjects":
            return list(self.hosts)
        if method == "productOnDepot_getObjects":
            return list(self.products)
        if method == "productOnClient_getObjects":
            return list(self.product_on_client.values())
        if method == "productOnClient_updateObjects":
            objects = params[0] if params else []
            if isinstance(objects, dict):
                objects = [objects]
            for item in objects:
                key = f"{item.get('clientId')}:{item.get('productId')}"
                current = self.product_on_client.get(key, {})
                current.update(item)
                self.product_on_client[key] = current
            return True
        if method == "productPropertyState_getObjects":
            out = []
            for (product_id, property_id, object_id), value in self.properties.items():
                out.append(
                    {
                        "productId": product_id,
                        "propertyId": property_id,
                        "objectId": object_id,
                        "value": value,
                    }
                )
            return out
        if method == "productPropertyState_updateObjects":
            objects = params[0] if params else []
            if isinstance(objects, dict):
                objects = [objects]
            for item in objects:
                object_id = str(item.get("objectId") or "")
                if not object_id:
                    raise OpsiControlError(
                        ErrorCode.VALIDATION_ERROR, "client-specific property requires objectId", status_code=400
                    )
                self.properties[(str(item.get("productId")), str(item.get("propertyId")), object_id)] = str(
                    item.get("value") or ""
                )
            return True
        if method == "log_read":
            client_id = str(params[0] if params else "")
            return self.logs.get(client_id, "")
        raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)

    def put_result_log(self, client_id: str, request_id: str, status: str, sha256: str) -> None:
        self.logs[client_id] = (
            f"SMC_ACTION_RESULT request_id={request_id} client_id={client_id} sha256={sha256} status={status} bytes=128 redacted=true\n"
        )
