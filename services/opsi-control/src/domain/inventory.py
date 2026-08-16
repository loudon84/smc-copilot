from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from integrations.opsi_jsonrpc import OpsiJsonRpc

REQUIRED_FACT_KEYS = (
    "os",
    "lastSeenMinutes",
    "owner",
    "diskFreeMb",
    "userSid",
    "userAccount",
    "gatewayHealthy",
    "previousVersion",
    "previousDigest",
)


@dataclass(frozen=True)
class EndpointInventorySnapshot:
    client_id: str
    os: str
    last_seen_minutes: int
    owner: str
    disk_free_mb: int
    user_sid: str
    user_account: str
    binding_source: str
    binding_observed_at: datetime
    gateway_healthy: bool
    previous_version: str
    previous_digest: str
    depot_id: str
    observed_at: datetime
    source: str


def _require(fact: dict[str, Any], key: str) -> Any:
    if key not in fact or fact[key] in (None, ""):
        raise ValueError(key)
    return fact[key]


async def depot_for_client(rpc: OpsiJsonRpc, client_id: str) -> str:
    try:
        states = await rpc.call("configState_getObjects", {"objectId": client_id, "configId": "clientconfig.depot.id"})
    except Exception:
        return ""
    for item in states or []:
        values = item.get("values") or []
        if values:
            return str(values[0])
    return ""


async def load_inventory(
    *,
    rpc: OpsiJsonRpc,
    client_id: str,
    facts: dict[str, dict[str, Any]],
) -> EndpointInventorySnapshot | None:
    hosts = await rpc.call("host_getObjects", {"id": client_id, "type": "OpsiClient"}, [])
    fact = facts.get(client_id)
    if not hosts or fact is None:
        return None
    missing = [key for key in REQUIRED_FACT_KEYS if key not in fact or fact[key] in (None, "")]
    if missing:
        return None
    try:
        observed = datetime.now(UTC)
        depot_id = str(fact.get("depotId") or "") or await depot_for_client(rpc, client_id)
        if not depot_id:
            return None
        digest = str(_require(fact, "previousDigest"))
        if len(digest) != 64:
            return None
        return EndpointInventorySnapshot(
            client_id=client_id,
            os=str(_require(fact, "os")),
            last_seen_minutes=int(_require(fact, "lastSeenMinutes")),
            owner=str(_require(fact, "owner")),
            disk_free_mb=int(_require(fact, "diskFreeMb")),
            user_sid=str(_require(fact, "userSid")),
            user_account=str(_require(fact, "userAccount")),
            binding_source=str(fact.get("bindingSource") or "operator-evidence"),
            binding_observed_at=observed,
            gateway_healthy=bool(_require(fact, "gatewayHealthy")),
            previous_version=str(_require(fact, "previousVersion")),
            previous_digest=digest,
            depot_id=depot_id,
            observed_at=observed,
            source="opsi-rpc+signed-result",
        )
    except (ValueError, TypeError, KeyError):
        return None
