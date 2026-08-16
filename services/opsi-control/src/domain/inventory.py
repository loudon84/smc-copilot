from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from integrations.opsi_jsonrpc import OpsiJsonRpc

REQUIRED_RPC_KEYS = ("osHint", "lastSeenMinutes", "depotId")
INVENTORY_TTL_SECONDS = 3600
TRUST_OPSI_CHECKSUM = "OPSI_AUTHENTICATED_CHECKSUM"


class BaselineKind(StrEnum):
    ABSENT = "ABSENT"
    INSTALLED = "INSTALLED"
    CONFLICT = "CONFLICT"


class FieldTrust(StrEnum):
    RPC = "opsi-rpc"
    BINDING = "operator-binding"
    ENDPOINT = "endpoint-status"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class InventoryField:
    value: Any
    source: str
    observed_at: datetime
    trust_level: str


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
    baseline_kind: str
    content_digest: str
    expiry: datetime
    cli_path: str = ""
    cli_version: str = ""
    bootstrap_task: str = ""
    gateway_task: str = ""
    trust_level: str = TRUST_OPSI_CHECKSUM

    def expired(self, now: datetime | None = None) -> bool:
        current = now or datetime.now(UTC)
        return current >= self.expiry


@dataclass(frozen=True)
class EndpointBindingRecord:
    client_id: str
    user_sid: str
    user_account: str
    evidence_ref: str
    revision: int
    approved_by: str
    observed_at: datetime
    reason: str
    change_ticket: str


def _digest_snapshot(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def classify_baseline(*, owner: str, previous_version: str, previous_digest: str) -> str:
    lowered = (owner or "").strip().lower()
    if lowered in {"salt", "runtime"}:
        return BaselineKind.CONFLICT.value
    if previous_version and len(previous_digest) == 64:
        return BaselineKind.INSTALLED.value
    if lowered in {"", "direct", "empty", "pending"}:
        return BaselineKind.ABSENT.value
    if lowered == "opsi" and not previous_digest:
        return BaselineKind.CONFLICT.value
    return BaselineKind.ABSENT.value


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


def snapshot_from_parts(
    *,
    client_id: str,
    rpc_host: dict[str, Any],
    depot_id: str,
    binding: EndpointBindingRecord | None,
    evidence: dict[str, Any] | None,
    now: datetime | None = None,
) -> EndpointInventorySnapshot | None:
    observed = now or datetime.now(UTC)
    if not rpc_host or not depot_id:
        return None
    evidence = evidence or {}
    os_name = str(evidence.get("os") or rpc_host.get("description") or "")
    if not os_name:
        return None
    last_seen = evidence.get("lastSeenMinutes")
    if last_seen is None:
        last_seen = rpc_host.get("lastSeenMinutes", 5)
    try:
        last_seen_minutes = int(last_seen)
    except (TypeError, ValueError):
        return None
    owner = str(evidence.get("owner") or "")
    disk = evidence.get("diskFreeMb")
    if disk is None:
        return None
    try:
        disk_free_mb = int(disk)
    except (TypeError, ValueError):
        return None
    sid = str((binding.user_sid if binding else "") or evidence.get("userSid") or "")
    account = str((binding.user_account if binding else "") or evidence.get("userAccount") or "")
    if not sid.startswith("S-1-") or not account:
        return None
    previous_version = str(evidence.get("previousVersion") or "")
    previous_digest = str(evidence.get("previousDigest") or "")
    if previous_digest and len(previous_digest) != 64:
        return None
    baseline = classify_baseline(owner=owner, previous_version=previous_version, previous_digest=previous_digest)
    gateway = bool(evidence.get("gatewayHealthy", False))
    payload = {
        "clientId": client_id,
        "os": os_name,
        "lastSeenMinutes": last_seen_minutes,
        "owner": owner,
        "diskFreeMb": disk_free_mb,
        "userSid": sid,
        "depotId": depot_id,
        "baselineKind": baseline,
        "previousDigest": previous_digest,
        "gatewayHealthy": gateway,
    }
    digest = _digest_snapshot(payload)
    return EndpointInventorySnapshot(
        client_id=client_id,
        os=os_name,
        last_seen_minutes=last_seen_minutes,
        owner=owner,
        disk_free_mb=disk_free_mb,
        user_sid=sid,
        user_account=account,
        binding_source=(binding.evidence_ref if binding else str(evidence.get("bindingSource") or "endpoint-status")),
        binding_observed_at=binding.observed_at if binding else observed,
        gateway_healthy=gateway,
        previous_version=previous_version,
        previous_digest=previous_digest,
        depot_id=depot_id,
        observed_at=observed,
        source="opsi-rpc+binding+endpoint-status",
        baseline_kind=baseline,
        content_digest=digest,
        expiry=datetime.fromtimestamp(observed.timestamp() + INVENTORY_TTL_SECONDS, tz=UTC),
        cli_path=str(evidence.get("cliPath") or ""),
        cli_version=str(evidence.get("cliVersion") or ""),
        bootstrap_task=str(evidence.get("bootstrapTask") or ""),
        gateway_task=str(evidence.get("gatewayTask") or ""),
    )


async def load_inventory(
    *,
    rpc: OpsiJsonRpc,
    client_id: str,
    store: InventoryReader | None = None,
    facts: dict[str, dict[str, Any]] | None = None,
) -> EndpointInventorySnapshot | None:
    if store is not None:
        snapshot = await store.get_snapshot(client_id)
        if snapshot is None or snapshot.expired():
            return None
        return snapshot
    # facts is rejected as a production source; tests must use the store.
    if facts:
        return None
    hosts = await rpc.call("host_getObjects", {"id": client_id, "type": "OpsiClient"}, [])
    if not hosts:
        return None
    return None


class InventoryReader:
    async def get_snapshot(self, client_id: str) -> EndpointInventorySnapshot | None:  # pragma: no cover - protocol
        raise NotImplementedError
