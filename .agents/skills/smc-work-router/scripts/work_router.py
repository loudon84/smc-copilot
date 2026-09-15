"""Deterministic risk routing from explicit, reviewable work facts.

v5.0.6 Work Router v3: Sensitive Touch signals allow LEAN; Hard Boundary Change
forces FULL. Keyword presence alone never upgrades governance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

REQUIRED = (
    "existing_owner",
    "existing_capability",
    "bounded_writes",
    "deterministic_verification",
)

# Legacy v1 risk list (any non-False blocks LEAN when v2 facts are absent).
RISKS = (
    "new_owner",
    "public_contract",
    "security_boundary",
    "schema_migration",
    "protocol_change",
    "external_dependency",
    "lifecycle_change",
    "cross_domain_ownership",
    "live_acceptance",
)

# @lat: [[frontend-context#Work Router v3]]
SENSITIVE_TOUCH = (
    "security_sensitive_touch",
    "existing_lifecycle_wiring",
    "cross_layer_existing_contract",
    "local_ui_acceptance",
    "existing_public_contract_use",
    "existing_external_dependency_use",
)

HARD_BOUNDARY = (
    "new_owner",
    "public_contract_change",
    "security_boundary_change",
    "schema_migration",
    "protocol_change",
    "external_dependency_change",
    "lifecycle_contract_change",
    "ownership_transfer",
    "cross_domain_contract_change",
    "external_live_acceptance",
)

# Map v1 risk names onto hard-boundary equivalents for fail-safe routing.
V1_HARD_MAP = {
    "public_contract": "public_contract_change",
    "security_boundary": "security_boundary_change",
    "external_dependency": "external_dependency_change",
    "lifecycle_change": "lifecycle_contract_change",
    "cross_domain_ownership": "cross_domain_contract_change",
    "live_acceptance": "external_live_acceptance",
}

RESEARCH_AUTHORITY = (
    "governed",
    "retained_production_change",
    "production_write_requested",
    "durable_product_artifact_requested",
)


def _tri(value: Any) -> bool | None:
    if value is True:
        return True
    if value is False:
        return False
    return None


def _research_intent(facts: dict[str, Any]) -> bool | None:
    if "research_intent" in facts:
        return _tri(facts.get("research_intent"))
    if "research_only" in facts:
        return _tri(facts.get("research_only"))
    return None


def _has_v2_signals(facts: dict[str, Any]) -> bool:
    markers = set(SENSITIVE_TOUCH) | (set(HARD_BOUNDARY) - set(RISKS))
    return any(k in facts for k in markers)


def _hard_boundary_active(facts: dict[str, Any]) -> list[str]:
    """Return hard-boundary keys that are True (or v1 fail-safe equivalents)."""
    active: list[str] = []
    v2 = _has_v2_signals(facts)

    if v2:
        for key in HARD_BOUNDARY:
            if facts.get(key) is True:
                active.append(key)
            elif key not in facts:
                # Map from v1 when present and not overridden false.
                for v1, hard in V1_HARD_MAP.items():
                    if hard == key and facts.get(v1) is True and facts.get(key) is not False:
                        # Explicit v2 override: security_sensitive_touch with boundary_change=false
                        if key == "security_boundary_change" and facts.get("security_boundary_change") is False:
                            continue
                        if key == "security_boundary_change" and facts.get("security_sensitive_touch") is True:
                            if facts.get("security_boundary_change") is False:
                                continue
                            # If only security_boundary (v1) true but sensitive_touch true and
                            # boundary_change explicitly false — skip. If boundary_change absent,
                            # sensitive_touch alone does not force FULL.
                            if facts.get("security_boundary") is True and "security_boundary_change" not in facts:
                                continue
                        if facts.get(v1) is True and key not in facts:
                            if key == "security_boundary_change" and facts.get("security_sensitive_touch") is True:
                                continue
                            active.append(key)
        # new_owner / schema_migration / protocol_change shared names
        for key in ("new_owner", "schema_migration", "protocol_change"):
            if facts.get(key) is True and key not in active:
                active.append(key)
        return list(dict.fromkeys(active))

    # Legacy: any RISKS non-False is hard.
    for key in RISKS:
        if facts.get(key) is not False:
            active.append(key)
    return active


def effective_research_only(facts: dict[str, Any], previous: str | None) -> tuple[bool, list[str]]:
    # @lat: [[acceptance-hardening#Work Router Research Trust]]
    """research_only is a hint; authority facts decide SPIKE/NONE eligibility."""
    reasons: list[str] = []
    intent = _research_intent(facts)
    if intent is not True:
        return False, reasons
    if previous not in {None, "NONE"}:
        reasons.append("RESEARCH_ONLY_PREVIOUS_PROFILE_BLOCKS")
        return False, reasons

    governed = _tri(facts.get("governed"))
    retained = _tri(facts.get("retained_production_change"))
    write_req = _tri(facts.get("production_write_requested"))
    durable = _tri(facts.get("durable_product_artifact_requested"))

    authority_present = any(k in facts for k in RESEARCH_AUTHORITY)
    if not authority_present and "research_intent" not in facts:
        reasons.append("WORK_RESEARCH_AUTHORITY_MISSING")
        return False, reasons

    if governed is True:
        reasons.append("RESEARCH_ONLY_CONTRADICTS_GOVERNED_WORK")
        return False, reasons
    if write_req is True:
        reasons.append("RESEARCH_ONLY_PRODUCTION_WRITE_CONFLICT")
        return False, reasons
    if retained is True:
        reasons.append("RESEARCH_ONLY_RETAINED_PRODUCTION_CHANGE")
        return False, reasons
    if durable is True:
        reasons.append("RESEARCH_ONLY_DURABLE_ARTIFACT_CONFLICT")
        return False, reasons

    for key, value in (
        ("governed", governed),
        ("retained_production_change", retained),
        ("production_write_requested", write_req),
        ("durable_product_artifact_requested", durable),
    ):
        if value is None and key in facts:
            reasons.append("WORK_RESEARCH_AUTHORITY_MISSING")
            return False, reasons
        if value is None and key not in facts and authority_present:
            reasons.append("WORK_RESEARCH_AUTHORITY_MISSING")
            return False, reasons

    if governed is False and retained is False and write_req is False and durable is False:
        return True, reasons

    reasons.append("WORK_RESEARCH_AUTHORITY_MISSING")
    return False, reasons


def route(
    facts: dict[str, Any],
    previous: str | None = None,
    *,
    authority: dict[str, Any] | None = None,
    authority_status: str | None = None,
    require_authority_for_none: bool = False,
    work_facts: dict[str, Any] | None = None,
    repo: Path | None = None,
    merge_decisions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Library-compatible router. Production orchestrators must call route_bound()."""
    # @lat: [[frontend-context#Work Router v3]]
    if not isinstance(facts, dict):
        raise ValueError("WORK_FACTS_INVALID")
    if previous is not None and previous not in {"NONE", "LEAN", "FULL"}:
        raise ValueError("PREVIOUS_PROFILE_INVALID")

    auth_status = authority_status or ("UNBOUND" if authority is None and work_facts is None else "VERIFIED")
    auth_sha = None
    merged = dict(facts)
    research_block: list[str] = []
    decisions = list(merge_decisions or [])
    source_digest_set: list[str] = []
    repo_identity = None

    if work_facts is not None:
        from work_facts import conservative_merge, envelope_facts, verify_envelope

        status, auth_reasons = verify_envelope(work_facts, repo=repo)
        auth_status = status
        auth_sha = work_facts.get("facts_digest")
        if status != "VERIFIED":
            for k in RESEARCH_AUTHORITY:
                merged.pop(k, None)
            research_block = auth_reasons or ["WORK_FACTS_AUTHORITY_MISSING"]
            if status == "UNBOUND":
                research_block = auth_reasons or ["WORK_FACTS_UNBOUND"]
            elif status == "STALE":
                research_block = ["WORK_FACTS_STALE"]
            elif status == "CONFLICT":
                research_block = ["WORK_FACTS_CONFLICT"]
        else:
            merged, more = conservative_merge(merged, envelope_facts(work_facts))
            decisions.extend(more)
            for prov in (work_facts.get("provenance") or {}).values():
                if isinstance(prov, dict) and prov.get("source_sha256"):
                    source_digest_set.append(str(prov["source_sha256"]))
        if repo is not None:
            repo_identity = str(repo.resolve())
    elif authority is not None:
        from work_authority import merge_route_facts, verify_authority

        legacy_status, legacy_reasons = verify_authority(authority)
        auth_sha = authority.get("authority_sha256")
        if legacy_status == "VERIFIED":
            merged = merge_route_facts(facts, authority)
            auth_status = "VERIFIED"
        else:
            for k in RESEARCH_AUTHORITY:
                merged.pop(k, None)
            research_block = legacy_reasons or ["WORK_AUTHORITY_MISSING"]
            auth_status = legacy_status

    known = all(merged.get(k) is True for k in REQUIRED)
    hard_active = _hard_boundary_active(merged)
    safe = len(hard_active) == 0
    reasons = list(hard_active)
    reasons += [k for k in REQUIRED if merged.get(k) is not True]
    # Surface sensitive touches as informational (do not force FULL).
    for k in SENSITIVE_TOUCH:
        if merged.get(k) is True:
            reasons.append(f"sensitive:{k}")

    research_ok, research_reasons = effective_research_only(merged, previous)
    reasons.extend(research_reasons)
    reasons.extend(research_block)

    authority_blocked_none = False
    bound_required = require_authority_for_none or authority is not None or work_facts is not None
    if research_ok and bound_required:
        if auth_status != "VERIFIED":
            research_ok = False
            authority_blocked_none = True
            if "WORK_FACTS_UNBOUND" not in reasons and "WORK_FACTS_STALE" not in reasons:
                if "WORK_FACTS_REPO_REQUIRED" not in reasons and "WORK_FACTS_CONFLICT" not in reasons:
                    reasons.append("WORK_AUTHORITY_MISSING" if work_facts is None else "WORK_FACTS_AUTHORITY_MISSING")
    if research_ok and require_authority_for_none and authority is None and work_facts is None:
        research_ok = False
        authority_blocked_none = True
        reasons.append("WORK_AUTHORITY_MISSING")

    if work_facts is not None and auth_status != "VERIFIED":
        work, profile = "ARCHITECTURAL", "FULL"
    elif research_ok:
        work, profile = "SPIKE", "NONE"
    elif authority_blocked_none or (
        (research_reasons or research_block) and _research_intent(merged) is True and previous in {None, "NONE"}
    ):
        work, profile = "ARCHITECTURAL", "FULL"
    elif known and safe and previous != "FULL":
        work = "BOUNDED"
        profile = "LEAN" if merged.get("governed") is True or previous == "LEAN" else "NONE"
        if profile == "NONE" and require_authority_for_none and auth_status != "VERIFIED":
            work, profile = "BOUNDED", "LEAN"
            reasons.append("WORK_AUTHORITY_MISSING")
    else:
        work, profile = "ARCHITECTURAL", "FULL"

    receipt_eligible = work_facts is not None and auth_status == "VERIFIED" and profile == "NONE"
    return {
        "schema": "smc.ges.work-route.v3",
        "work_class": work,
        "governance_profile": profile,
        "reasons": reasons,
        "reason_codes": list(dict.fromkeys(reasons)),
        "facts": merged,
        "effective_research_only": research_ok,
        "authority_sha256": auth_sha,
        "authority_status": auth_status if bound_required else "UNBOUND",
        "facts_digest": auth_sha if work_facts is not None else None,
        "repo_identity": repo_identity,
        "source_digest_set": sorted(set(source_digest_set)),
        "merge_decisions": decisions,
        "receipt_eligible": receipt_eligible,
        "hard_boundary": hard_active,
        "sensitive_touch": [k for k in SENSITIVE_TOUCH if merged.get(k) is True],
    }


def route_bound(
    repo: Path | None,
    envelope: dict[str, Any],
    previous: str | None = None,
    *,
    caller_facts: dict[str, Any] | None = None,
    feature_scope: dict[str, Any] | None = None,
    claimed_app_or_surface: bool = False,
    work_item_id: str = "",
) -> dict[str, Any]:
    """Production entry: requires verified work-facts envelope + repo."""
    # @lat: [[safety-runtime-closure-v503]]
    # @lat: [[adaptive-governance-context-v508#分类与升级]]
    from work_facts import conservative_merge, envelope_facts

    if repo is None:
        base = dict(caller_facts or {})
        merged, decisions = conservative_merge(base, envelope_facts(envelope))
        out = route(
            merged,
            previous,
            work_facts=envelope,
            require_authority_for_none=True,
            repo=None,
            merge_decisions=decisions,
        )
        out["authority_status"] = "UNBOUND"
        out["governance_profile"] = "FULL"
        out["work_class"] = "ARCHITECTURAL"
        out["receipt_eligible"] = False
        if "WORK_FACTS_REPO_REQUIRED" not in out["reasons"]:
            out["reasons"] = ["WORK_FACTS_REPO_REQUIRED", *out["reasons"]]
            out["reason_codes"] = list(dict.fromkeys(out["reasons"]))
        if work_item_id:
            out["feature_complexity"] = derive_feature_complexity(
                out,
                work_item_id=work_item_id,
                feature_scope=feature_scope,
                claimed_app_or_surface=claimed_app_or_surface,
            )
        return out

    repo = Path(repo).resolve()
    base = dict(caller_facts or {})
    merged, decisions = conservative_merge(base, envelope_facts(envelope))
    out = route(
        merged,
        previous,
        work_facts=envelope,
        require_authority_for_none=True,
        repo=repo,
        merge_decisions=decisions,
    )
    if work_item_id or feature_scope is not None or claimed_app_or_surface:
        out["feature_complexity"] = derive_feature_complexity(
            out,
            work_item_id=work_item_id or "unspecified",
            feature_scope=feature_scope,
            claimed_app_or_surface=claimed_app_or_surface,
        )
        # Scope invalid must not leave a LEAN permit on the route.
        if out["feature_complexity"].get("error") == "FEATURE_SCOPE_INVALID":
            if out.get("governance_profile") == "LEAN":
                out["governance_profile"] = "FULL"
                out["work_class"] = "ARCHITECTURAL"
                out["reasons"] = list(out.get("reasons") or []) + ["FEATURE_SCOPE_INVALID"]
                out["reason_codes"] = list(dict.fromkeys(out["reasons"]))
                out["feature_complexity"] = derive_feature_complexity(
                    out,
                    work_item_id=work_item_id or "unspecified",
                    feature_scope=feature_scope,
                    claimed_app_or_surface=claimed_app_or_surface,
                )
    return out


def _canonical_digest(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def _utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# @lat: [[adaptive-governance-context-v508#单一权威边界]]
def derive_feature_complexity(
    route_result: dict[str, Any],
    *,
    work_item_id: str,
    feature_scope: dict[str, Any] | None = None,
    claimed_app_or_surface: bool = False,
) -> dict[str, Any]:
    """Derive smc.ges.feature-complexity.v1 from an existing work-route.v3 (never reclassifies)."""
    if not work_item_id or not str(work_item_id).strip():
        raise ValueError("WORK_ITEM_ID_REQUIRED")
    if not isinstance(route_result, dict) or route_result.get("schema") != "smc.ges.work-route.v3":
        raise ValueError("WORK_ROUTE_REQUIRED")

    reasons = list(route_result.get("reason_codes") or route_result.get("reasons") or [])
    error: str | None = None
    scope_digest: str | None = None

    if feature_scope is not None:
        if not isinstance(feature_scope, dict) or feature_scope.get("schema") != "smc.ges.feature-scope.v1":
            error = "FEATURE_SCOPE_INVALID"
            reasons = list(dict.fromkeys([*reasons, error]))
        elif feature_scope.get("ok") is False:
            error = "FEATURE_SCOPE_INVALID"
            reasons = list(dict.fromkeys([*reasons, error]))
        else:
            scope_digest = _canonical_digest(
                {
                    "schema": feature_scope.get("schema"),
                    "app_id": feature_scope.get("app_id"),
                    "surface_id": feature_scope.get("surface_id"),
                    "layout_owner": feature_scope.get("layout_owner"),
                    "decision": feature_scope.get("decision"),
                }
            )
    elif claimed_app_or_surface:
        error = "FEATURE_SCOPE_INVALID"
        reasons = list(dict.fromkeys([*reasons, error]))

    auth = str(route_result.get("authority_status") or "")
    # Only fail closed for bound-path verification failures, not unbound library routing.
    if auth in {"STALE", "CONFLICT", "INVALID"} or (
        auth == "UNBOUND" and route_result.get("facts_digest")
    ):
        if route_result.get("governance_profile") in {"LEAN", "NONE"}:
            error = error or "WORK_FACTS_UNVERIFIED"
            reasons = list(dict.fromkeys([*reasons, "WORK_FACTS_UNVERIFIED"]))

    facts_digest = route_result.get("facts_digest")
    if facts_digest and not str(facts_digest).startswith("sha256:"):
        facts_digest = f"sha256:{facts_digest}"

    route_digest = _canonical_digest(
        {
            "schema": route_result.get("schema"),
            "work_class": route_result.get("work_class"),
            "governance_profile": route_result.get("governance_profile"),
            "facts_digest": facts_digest,
            "authority_status": route_result.get("authority_status"),
            "reason_codes": route_result.get("reason_codes") or route_result.get("reasons") or [],
        }
    )

    out: dict[str, Any] = {
        "schema": "smc.ges.feature-complexity.v1",
        "work_item_id": str(work_item_id).strip(),
        "repo_identity": route_result.get("repo_identity"),
        "work_facts_digest": facts_digest,
        "work_route_schema": "smc.ges.work-route.v3",
        "work_route_digest": route_digest,
        "feature_scope_digest": scope_digest,
        "work_class": route_result.get("work_class"),
        "governance_profile": route_result.get("governance_profile"),
        "classification_state": "PROVISIONAL",
        "reasons": reasons,
        "generated_at": _utc_now(),
    }
    if error:
        out["error"] = error
        # Invalid scope / unverified facts never authorize LEAN on the receipt.
        if out.get("governance_profile") == "LEAN":
            out["governance_profile"] = "FULL"
            out["work_class"] = "ARCHITECTURAL"
            out["reasons"] = list(dict.fromkeys([*out["reasons"], error]))
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("facts", type=Path, nargs="?", help="raw facts JSON (requires --unsafe-raw-facts) or work-facts envelope")
    p.add_argument("--previous-profile", choices=("NONE", "LEAN", "FULL"))
    p.add_argument("--authority", type=Path, help="legacy smc.ges.work-authority.v1 (compat)")
    p.add_argument("--work-facts", type=Path, help="smc.ges.work-facts.v1|v2 envelope (production default)")
    p.add_argument("--repo", type=Path, help="canonical repo root for source freshness")
    p.add_argument(
        "--unsafe-raw-facts",
        action="store_true",
        help="dev/selftest only: allow unbound raw facts JSON; forbidden for production orchestrators",
    )
    a = p.parse_args()
    if a.work_facts:
        from work_facts import load_envelope

        env = load_envelope(a.work_facts)
        print(json.dumps(route_bound(a.repo, env, a.previous_profile), indent=2, ensure_ascii=False))
        return
    if a.authority:
        from work_authority import load_authority

        authority = load_authority(a.authority)
        caller = {}
        if a.facts:
            caller = json.loads(a.facts.read_text(encoding="utf-8"))
        print(
            json.dumps(
                route(caller, a.previous_profile, authority=authority, require_authority_for_none=True),
                indent=2,
                ensure_ascii=False,
            )
        )
        return
    if not a.facts:
        raise SystemExit("facts path or --work-facts required")
    raw = json.loads(a.facts.read_text(encoding="utf-8"))
    if raw.get("schema") in {"smc.ges.work-facts.v1", "smc.ges.work-facts.v2"}:
        print(json.dumps(route_bound(a.repo, raw, a.previous_profile), indent=2, ensure_ascii=False))
        return
    if not a.unsafe_raw_facts:
        raise SystemExit(
            "production CLI requires --work-facts (or pass envelope JSON); use --unsafe-raw-facts only for dev/selftest"
        )
    print("WORK_FACTS_UNBOUND_NOT_PRODUCTION", file=__import__("sys").stderr)
    out = route(raw, a.previous_profile, require_authority_for_none=True)
    out["receipt_eligible"] = False
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
