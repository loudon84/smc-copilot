from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProductPropertyState(BaseModel):
    """Normalized ProductPropertyState. OPSI wire uses values:[]; never expose raw objects."""

    product_id: str
    property_id: str
    object_id: str
    values: list[str] = Field(default_factory=list)

    @property
    def value(self) -> str:
        return self.values[0] if self.values else ""


class ProductOnClient(BaseModel):
    product_id: str
    client_id: str
    installation_status: str = "unknown"
    action_request: str = "none"
    action_progress: str = ""
    action_result: str = "none"
    last_action: str = ""
    modification_time: str | None = None


class HostObject(BaseModel):
    host_id: str
    host_type: str = "OpsiClient"
    description: str = ""


def values_from_wire(item: dict[str, Any]) -> list[str]:
    if "values" in item and item["values"] is not None:
        raw = item["values"]
        if isinstance(raw, list):
            return [str(part) for part in raw]
        return [str(raw)]
    if item.get("value") is not None:
        return [str(item["value"])]
    return []


def property_from_wire(item: dict[str, Any]) -> ProductPropertyState:
    return ProductPropertyState(
        product_id=str(item.get("productId") or ""),
        property_id=str(item.get("propertyId") or ""),
        object_id=str(item.get("objectId") or ""),
        values=values_from_wire(item),
    )


def property_to_wire(state: ProductPropertyState) -> dict[str, Any]:
    return {
        "productId": state.product_id,
        "propertyId": state.property_id,
        "objectId": state.object_id,
        "values": list(state.values),
    }


def product_on_client_from_wire(item: dict[str, Any]) -> ProductOnClient:
    return ProductOnClient(
        product_id=str(item.get("productId") or ""),
        client_id=str(item.get("clientId") or ""),
        installation_status=str(item.get("installationStatus") or "unknown"),
        action_request=str(item.get("actionRequest") or "none"),
        action_progress=str(item.get("actionProgress") or ""),
        action_result=str(item.get("actionResult") or "none"),
        last_action=str(item.get("lastAction") or ""),
        modification_time=item.get("modificationTime"),
    )


def host_from_wire(item: dict[str, Any]) -> HostObject:
    return HostObject(
        host_id=str(item.get("id") or ""),
        host_type=str(item.get("type") or "OpsiClient"),
        description=str(item.get("description") or ""),
    )


class HostControlOutcome(BaseModel):
    """Normalized per-host HostControl result. Never expose raw OPSI objects."""

    host_id: str
    success: bool = False
    reachable: bool | None = None
    stdout: str = ""
    error: str = ""


def _error_text(raw: Any) -> str:
    if isinstance(raw, dict):
        nested = raw.get("error")
        if isinstance(nested, dict):
            return str(nested.get("message") or nested.get("class") or "hostcontrol error")
        if nested:
            return str(nested)
        if raw.get("message"):
            return str(raw["message"])
    if raw is None:
        return ""
    return str(raw)


def host_control_from_wire(method: str, host_id: str, raw: Any) -> HostControlOutcome:
    per_host = raw
    if isinstance(raw, dict) and host_id in raw:
        per_host = raw[host_id]
    if method == "hostControlSafe_reachable":
        if per_host is True:
            return HostControlOutcome(host_id=host_id, success=True, reachable=True)
        if per_host is False:
            return HostControlOutcome(host_id=host_id, success=False, reachable=False)
        error = _error_text(per_host)
        return HostControlOutcome(host_id=host_id, success=False, reachable=False, error=error)
    if method != "hostControlSafe_execute":
        raise ValueError(f"unsupported hostcontrol method: {method}")
    stdout = ""
    error = ""
    success = False
    if isinstance(per_host, str):
        stdout = per_host
        success = True
    elif isinstance(per_host, dict):
        error = _error_text(per_host)
        if not error:
            stdout = str(per_host.get("stdout") or per_host.get("result") or per_host.get("output") or "")
            success = True
    elif per_host is not None:
        stdout = str(per_host)
        success = True
    return HostControlOutcome(host_id=host_id, success=success, stdout=stdout, error=error)
