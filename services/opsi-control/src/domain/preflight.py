from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from domain.inventory import EndpointInventorySnapshot, load_inventory
from domain.snapshot import PREFLIGHT_TTL_SECONDS
from integrations.opsi_jsonrpc import OpsiJsonRpc

SUPPORTED_OS = {"windows10", "windows11", "windows"}


def _os_supported(os_name: str) -> bool:
    lowered = os_name.lower()
    return any(token in lowered for token in SUPPORTED_OS) or lowered in {
        "lab-a",
        "lab-b",
        "lab-win10",
        "lab-win11",
    }


async def _depot_has_product(
    rpc: OpsiJsonRpc, snapshot: EndpointInventorySnapshot, product_id: str, product_version: str
) -> bool:
    products = await rpc.call("productOnDepot_getObjects", {}, [])
    matches = [
        item
        for item in products
        if item.get("productId") == product_id and item.get("productVersion") == product_version
    ]
    if not matches:
        return False
    depot_scoped = [item for item in matches if item.get("depotId")]
    if not depot_scoped:
        return True
    return any(item.get("depotId") == snapshot.depot_id for item in depot_scoped)


async def evaluate_target(
    *,
    rpc: OpsiJsonRpc,
    client_id: str,
    campaign_id: str,
    product_id: str,
    product_version: str,
    artifact_digest: str,
    facts: dict[str, dict[str, Any]],
    active_clients: set[str],
    promotion_ok: bool,
    promotion_channel: str,
    required_channel: str = "pilot",
) -> tuple[list[dict[str, Any]], str, str, str]:
    checks: list[dict[str, Any]] = []
    snapshot = await load_inventory(rpc=rpc, client_id=client_id, facts=facts)
    exists = snapshot is not None
    checks.append({"code": "client_exists", "passed": exists, "detail": "" if exists else "missing"})
    if snapshot is None:
        checks.append({"code": "authoritative_inventory", "passed": False, "detail": "incomplete"})
        return checks, "", "", "authoritative_inventory"

    os_ok = _os_supported(snapshot.os)
    checks.append({"code": "os_supported", "passed": os_ok, "detail": snapshot.os})
    seen_ok = snapshot.last_seen_minutes <= 60
    checks.append({"code": "recently_seen", "passed": seen_ok, "detail": str(snapshot.last_seen_minutes)})
    depot_ok = await _depot_has_product(rpc, snapshot, product_id, product_version)
    checks.append({"code": "depot_product", "passed": depot_ok, "detail": snapshot.depot_id})
    owner_ok = snapshot.owner == "opsi"
    checks.append({"code": "owner_opsi", "passed": owner_ok, "detail": snapshot.owner})
    artifact_ok = promotion_ok and promotion_channel == required_channel and len(artifact_digest) == 64
    checks.append({"code": "artifact_channel", "passed": artifact_ok, "detail": promotion_channel})
    baseline_ok = bool(snapshot.previous_version and len(snapshot.previous_digest) == 64)
    checks.append({"code": "rollback_baseline", "passed": baseline_ok, "detail": snapshot.previous_version})
    binding_ok = bool(snapshot.user_sid.startswith("S-1-") and snapshot.user_account)
    if facts.get(client_id, {}).get("userBindingUnknown"):
        binding_ok = False
    checks.append({"code": "user_binding", "passed": binding_ok, "detail": snapshot.binding_source})
    disk_ok = snapshot.disk_free_mb >= 512
    checks.append({"code": "disk", "passed": disk_ok, "detail": str(snapshot.disk_free_mb)})
    checks.append({"code": "gateway_health", "passed": snapshot.gateway_healthy, "detail": ""})
    concurrent_ok = client_id not in active_clients
    checks.append({"code": "no_active_mutation", "passed": concurrent_ok, "detail": campaign_id})
    secret_ok = not bool(facts.get(client_id, {}).get("secretCanary"))
    checks.append({"code": "secret_canary", "passed": secret_ok, "detail": ""})
    failed = [item["code"] for item in checks if not item["passed"]]
    reason = ",".join(failed)
    return checks, snapshot.previous_version, snapshot.previous_digest, reason


def preflight_expired(preflight_at: datetime | None, now: datetime | None = None) -> bool:
    if preflight_at is None:
        return True
    current = now or datetime.now(UTC)
    return (current - preflight_at).total_seconds() > PREFLIGHT_TTL_SECONDS


def window_in_utc(start_local: datetime, end_local: datetime, timezone: str) -> tuple[datetime, datetime]:
    if timezone.upper() == "UTC":
        start = start_local.replace(tzinfo=UTC) if start_local.tzinfo is None else start_local.astimezone(UTC)
        end = end_local.replace(tzinfo=UTC) if end_local.tzinfo is None else end_local.astimezone(UTC)
    else:
        zone = ZoneInfo(timezone)
        start = start_local.replace(tzinfo=zone).astimezone(UTC)
        end = end_local.replace(tzinfo=zone).astimezone(UTC)
    if end <= start:
        raise ValueError("maintenance window end must be after start")
    return start, end
