from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Protocol

from core.errors import ErrorCode, OpsiControlError
from integrations.dto import property_from_wire, property_to_wire, values_from_wire

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
        "configState_getObjects",
        "hostControlSafe_reachable",
        "hostControlSafe_execute",
    }
)
HOSTCONTROL_METHODS = frozenset({"hostControlSafe_reachable", "hostControlSafe_execute"})
CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "opsi-4.3"
INSTLOG_MAX = 262_144


class OpsiJsonRpc(Protocol):
    async def call(self, method: str, *params: Any) -> Any: ...

    async def ready(self) -> bool: ...


def host_ids_from_params(method: str, params: tuple[Any, ...] | list[Any]) -> Any:
    if method == "hostControlSafe_reachable":
        return params[0] if params else None
    if method == "hostControlSafe_execute":
        return params[1] if len(params) > 1 else None
    return None


def assert_rpc_call(method: str, *params: Any) -> None:
    if method not in ALLOWED_METHODS:
        raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)
    if method not in HOSTCONTROL_METHODS:
        return
    host_ids = host_ids_from_params(method, params)
    if not isinstance(host_ids, list) or len(host_ids) != 1:
        raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, "hostIds must be a single client id", status_code=400)
    host_id = str(host_ids[0])
    if "*" in host_id or "?" in host_id or not CLIENT_ID_RE.fullmatch(host_id):
        raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, "wildcard hostIds are not allowed", status_code=400)


def load_fixture(name: str) -> Any:
    path = FIXTURE_DIR / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


class FakeOpsiJsonRpc:
    """In-memory opsiconfd stand-in matching OPSI 4.3 shapes. Never used in production."""

    def __init__(self) -> None:
        self.hosts: list[dict[str, Any]] = [
            {"id": "client-a.example", "type": "OpsiClient", "description": "lab-a", "lastSeenMinutes": 5},
            {"id": "client-b.example", "type": "OpsiClient", "description": "lab-b", "lastSeenMinutes": 5},
            {"id": "client-c.example", "type": "OpsiClient", "description": "lab-c", "lastSeenMinutes": 5},
            {"id": "client-d.example", "type": "OpsiClient", "description": "lab-d", "lastSeenMinutes": 5},
            {"id": "client-e.example", "type": "OpsiClient", "description": "lab-e", "lastSeenMinutes": 5},
        ]
        self.products: list[dict[str, Any]] = [
            {
                "productId": "smc-hermes-agent",
                "productVersion": "1.7.0",
                "packageVersion": "1",
                "depotId": "depot.example",
            },
            {
                "productId": "smc-hermes-agent",
                "productVersion": "0.22.0",
                "packageVersion": "1",
                "depotId": "depot.example",
            },
            {
                "productId": "smc-hermes-agent",
                "productVersion": "0.21.0",
                "packageVersion": "1",
                "depotId": "depot.example",
            },
        ]
        self.product_on_client: dict[str, dict[str, Any]] = {}
        self.properties: dict[tuple[str, str, str], list[str]] = {}
        self.logs: dict[str, str] = {}
        self._available = True
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.write_timeouts: set[str] = set()
        self.depot_mapping: dict[str, str] = {host["id"]: "depot.example" for host in self.hosts}
        self.host_reachable: dict[str, bool] = {host["id"]: True for host in self.hosts}
        self.execute_stdout: dict[str, str] = {host["id"]: "0.22.0-smc.1" for host in self.hosts}
        self.execute_error: dict[str, str] = {}

    @property
    def available(self) -> bool:
        return self._available

    def set_available(self, value: bool) -> None:
        self._available = value

    async def ready(self) -> bool:
        return self._available

    def property_scalar(self, product_id: str, property_id: str, object_id: str) -> str:
        values = self.properties.get((product_id, property_id, object_id), [])
        return values[0] if values else ""

    async def call(self, method: str, *params: Any) -> Any:
        assert_rpc_call(method, *params)
        if not self._available:
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc unavailable", status_code=503)
        self.calls.append((method, params))
        if method in self.write_timeouts and method.endswith("updateObjects"):
            raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "opsi rpc timeout", status_code=503)
        if method == "backend_info":
            return load_fixture("backend_info.json") or {"opsiVersion": "4.3-fake"}
        if method == "host_getObjects":
            filters = params[0] if params else {}
            out = list(self.hosts)
            if isinstance(filters, dict):
                if filters.get("id"):
                    out = [item for item in out if item.get("id") == filters["id"]]
                if filters.get("type"):
                    out = [item for item in out if item.get("type") == filters["type"]]
            return out
        if method == "configState_getObjects":
            filters = params[0] if params else {}
            items = [
                {"objectId": client_id, "configId": "clientconfig.depot.id", "values": [depot]}
                for client_id, depot in self.depot_mapping.items()
            ]
            if isinstance(filters, dict):
                if filters.get("objectId"):
                    items = [item for item in items if item["objectId"] == filters["objectId"]]
                if filters.get("configId"):
                    items = [item for item in items if item["configId"] == filters["configId"]]
            return items
        if method == "productOnDepot_getObjects":
            return list(self.products)
        if method == "productOnClient_getObjects":
            filters = params[0] if params else {}
            items = list(self.product_on_client.values())
            if isinstance(filters, dict):
                if filters.get("clientId"):
                    items = [item for item in items if item.get("clientId") == filters["clientId"]]
                if filters.get("productId"):
                    items = [item for item in items if item.get("productId") == filters["productId"]]
            return items
        if method == "productOnClient_updateObjects":
            objects = params[0] if params else []
            if isinstance(objects, dict):
                objects = [objects]
            for item in objects:
                key = f"{item.get('clientId')}:{item.get('productId')}"
                current = self.product_on_client.get(key, {})
                current.update(item)
                current.setdefault("installationStatus", "unknown")
                current.setdefault("actionProgress", "")
                current.setdefault("actionResult", "none")
                current.setdefault("lastAction", "")
                current.setdefault("modificationTime", "2026-08-14T08:00:00Z")
                self.product_on_client[key] = current
            return True
        if method == "productPropertyState_getObjects":
            filters = params[0] if params else {}
            out = []
            for (product_id, property_id, object_id), values in self.properties.items():
                item = {
                    "productId": product_id,
                    "propertyId": property_id,
                    "objectId": object_id,
                    "values": list(values),
                }
                if isinstance(filters, dict):
                    if filters.get("objectId") and object_id != filters["objectId"]:
                        continue
                    if filters.get("productId") and product_id != filters["productId"]:
                        continue
                    if filters.get("propertyId") and property_id != filters["propertyId"]:
                        continue
                out.append(item)
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
                values = values_from_wire(item)
                self.properties[(str(item.get("productId")), str(item.get("propertyId")), object_id)] = values
            return True
        if method == "log_read":
            log_type = str(params[0] if params else "instlog")
            if log_type != "instlog":
                raise OpsiControlError(ErrorCode.VALIDATION_ERROR, "only instlog is allowed", status_code=400)
            client_id = str(params[1] if len(params) > 1 else "")
            max_size = int(params[2] if len(params) > 2 else INSTLOG_MAX)
            max_size = min(max(max_size, 0), INSTLOG_MAX)
            body = self.logs.get(client_id, "")
            return body[-max_size:]
        if method == "hostControlSafe_reachable":
            host_id = str(params[0][0])
            return {host_id: bool(self.host_reachable.get(host_id, False))}
        if method == "hostControlSafe_execute":
            host_id = str(params[1][0])
            if not self.host_reachable.get(host_id, False):
                return {host_id: {"error": {"class": "BackendIOError", "message": "not reachable"}}}
            error = self.execute_error.get(host_id)
            if error:
                return {host_id: {"error": {"class": "RuntimeError", "message": error}}}
            return {host_id: self.execute_stdout.get(host_id, "")}
        raise OpsiControlError(ErrorCode.OPSI_RPC_DENIED, f"rpc not allowed: {method}", status_code=400)

    def put_result_log(self, client_id: str, request_id: str, status: str, sha256: str, bytes_n: int = 128) -> None:
        self.logs[client_id] = (
            f"SMC_ACTION_RESULT request_id={request_id} client_id={client_id} "
            f"sha256={sha256} status={status} bytes={bytes_n} redacted=true\n"
        )


def wire_properties(items: list[Any]) -> list[dict[str, Any]]:
    out = []
    for item in items:
        if hasattr(item, "product_id"):
            out.append(property_to_wire(item))
        else:
            out.append(property_to_wire(property_from_wire(item)))
    return out
