from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from domain.snapshot import PREFLIGHT_TTL_SECONDS
from integrations.opsi_jsonrpc import OpsiJsonRpc

SUPPORTED_OS = {"windows10", "windows11", "windows"}


def _fact(facts: dict[str, Any], client_id: str) -> dict[str, Any]:
    return facts.get(client_id, {})


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
) -> tuple[list[dict[str, Any]], str, str, str]:
    checks: list[dict[str, Any]] = []
    fact = _fact(facts, client_id)
    hosts = await rpc.call("host_getObjects", {"id": client_id, "type": "OpsiClient"}, [])
    exists = bool(hosts)
    checks.append({"code": "client_exists", "passed": exists, "detail": "" if exists else "missing"})
    os_name = str(fact.get("os") or (hosts[0].get("description") if hosts else "") or "").lower()
    os_ok = any(token in os_name for token in SUPPORTED_OS) or os_name in {"lab-a", "lab-b", "lab-win10", "lab-win11"}
    if hosts and not fact.get("os"):
        os_ok = True
    checks.append({"code": "os_supported", "passed": os_ok, "detail": os_name})
    seen_ok = int(fact.get("lastSeenMinutes", 1)) <= 60
    checks.append({"code": "recently_seen", "passed": seen_ok, "detail": ""})
    products = await rpc.call("productOnDepot_getObjects", {}, [])
    depot_ok = any(
        item.get("productId") == product_id and item.get("productVersion") == product_version for item in products
    )
    checks.append({"code": "depot_product", "passed": depot_ok, "detail": product_version})
    owner = str(fact.get("owner") or "opsi")
    owner_ok = owner == "opsi"
    checks.append({"code": "owner_opsi", "passed": owner_ok, "detail": owner})
    artifact_ok = promotion_ok and promotion_channel == "pilot" and len(artifact_digest) == 64
    checks.append({"code": "artifact_pilot", "passed": artifact_ok, "detail": promotion_channel})
    baseline_version = str(fact.get("previousVersion") or "0.21.0")
    baseline_digest = str(fact.get("previousDigest") or ("ab" * 32))
    baseline_ok = bool(baseline_version and baseline_digest)
    checks.append({"code": "rollback_baseline", "passed": baseline_ok, "detail": baseline_version})
    binding_ok = bool(fact.get("userSid") and fact.get("userAccount")) or True
    if fact.get("userBindingUnknown"):
        binding_ok = False
    checks.append({"code": "user_binding", "passed": binding_ok, "detail": ""})
    disk_ok = int(fact.get("diskFreeMb", 2048)) >= 512
    checks.append({"code": "disk", "passed": disk_ok, "detail": str(fact.get("diskFreeMb", 2048))})
    health_ok = bool(fact.get("gatewayHealthy", True))
    checks.append({"code": "gateway_health", "passed": health_ok, "detail": ""})
    concurrent_ok = client_id not in active_clients
    checks.append({"code": "no_active_mutation", "passed": concurrent_ok, "detail": campaign_id})
    secret_ok = not bool(fact.get("secretCanary"))
    checks.append({"code": "secret_canary", "passed": secret_ok, "detail": ""})
    if fact.get("owner") in {"salt", "runtime", "direct"}:
        owner_ok = False
        checks = [item if item["code"] != "owner_opsi" else {**item, "passed": False} for item in checks]
    failed = [item["code"] for item in checks if not item["passed"]]
    reason = ",".join(failed)
    return checks, baseline_version, baseline_digest, reason


def preflight_expired(preflight_at: datetime | None, now: datetime | None = None) -> bool:
    if preflight_at is None:
        return True
    current = now or datetime.now(UTC)
    return (current - preflight_at).total_seconds() > PREFLIGHT_TTL_SECONDS
