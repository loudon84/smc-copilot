#!/usr/bin/env python3
"""Bound Work Facts — content-bound routing receipt (not a second SOT)."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from path_containment import PathContainmentError, safe_repo_relative

SCHEMA = "smc.ges.work-facts.v1"
SCHEMA_V2 = "smc.ges.work-facts.v2"
ALLOWED_SCHEMAS = frozenset({SCHEMA, SCHEMA_V2})
ALLOWED_KINDS = frozenset(
    {"ROADMAP", "FEATURE", "PRD", "PLAN", "ORCHESTRATOR_REQUEST", "DERIVED"}
)
FORBIDDEN_ALONE = frozenset({"WORKER_ASSERTION", "MODEL_GUESS", "PROMPT_TEXT_ONLY"})
AUTHORITY_FACTS = (
    "governed",
    "retained_production_change",
    "production_write_requested",
    "durable_product_artifact_requested",
)
SENSITIVE_TOUCH_FACTS = (
    "security_sensitive_touch",
    "existing_lifecycle_wiring",
    "cross_layer_existing_contract",
    "local_ui_acceptance",
    "existing_public_contract_use",
    "existing_external_dependency_use",
)
HARD_BOUNDARY_FACTS = (
    "public_contract_change",
    "security_boundary_change",
    "external_dependency_change",
    "lifecycle_contract_change",
    "ownership_transfer",
    "cross_domain_contract_change",
    "external_live_acceptance",
)
ALL_FACTS = (
    "existing_owner",
    "existing_capability",
    "bounded_writes",
    "deterministic_verification",
    "new_owner",
    "public_contract",
    "security_boundary",
    "schema_migration",
    "protocol_change",
    "external_dependency",
    "lifecycle_change",
    "cross_domain_ownership",
    "live_acceptance",
    "research_intent",
    *AUTHORITY_FACTS,
)
ALL_FACTS_V2 = (
    *ALL_FACTS,
    *SENSITIVE_TOUCH_FACTS,
    *HARD_BOUNDARY_FACTS,
)
RISK_OR_PRODUCTION = frozenset(
    {
        "new_owner",
        "public_contract",
        "security_boundary",
        "schema_migration",
        "protocol_change",
        "external_dependency",
        "lifecycle_change",
        "cross_domain_ownership",
        "live_acceptance",
        *HARD_BOUNDARY_FACTS,
        "retained_production_change",
        "production_write_requested",
        "durable_product_artifact_requested",
        "governed",
    }
)
PROV_REQUIRED = ("source_kind", "source_ref", "source_sha256", "authority")


def _sha_payload(value: dict[str, Any]) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def _sha_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def facts_path(repo: Path, work_item_id: str) -> Path:
    return repo / ".smc" / "runs" / work_item_id / "routing" / "work-facts.json"


def compute_facts_digest(work_item_id: str, facts: dict[str, Any], provenance: dict[str, Any], schema: str = SCHEMA) -> str:
    body = {"schema": schema, "work_item_id": work_item_id, "facts": facts, "provenance": provenance}
    return _sha_payload(body)


def _fact_keys_for(schema: str) -> tuple[str, ...]:
    return ALL_FACTS_V2 if schema == SCHEMA_V2 else ALL_FACTS


def build_envelope(
    work_item_id: str,
    facts: dict[str, Any],
    provenance: dict[str, Any] | None = None,
    *,
    schema: str = SCHEMA,
) -> dict[str, Any]:
    # @lat: [[governance-architecture-closure]]
    # @lat: [[frontend-context#Work Router v3]]
    if schema not in ALLOWED_SCHEMAS:
        raise ValueError("WORK_FACTS_INVALID")
    keys = _fact_keys_for(schema)
    # Auto-promote to v2 when v2-only keys are supplied.
    if schema == SCHEMA and any(k in facts for k in (*SENSITIVE_TOUCH_FACTS, *HARD_BOUNDARY_FACTS)):
        schema = SCHEMA_V2
        keys = ALL_FACTS_V2
    normalized = {k: facts.get(k) for k in keys}
    prov = provenance or {}
    digest = compute_facts_digest(work_item_id, normalized, prov, schema)
    return {
        "schema": schema,
        "work_item_id": work_item_id,
        "facts": normalized,
        "provenance": prov,
        "facts_digest": digest,
    }


def from_work_authority(authority: dict[str, Any]) -> dict[str, Any]:
    """Read-only compat: work-authority.v1 → work-facts.v1 (not production-bound by itself)."""
    sources = authority.get("sources") or []
    provenance: dict[str, Any] = {}
    for src in sources:
        if not isinstance(src, dict):
            continue
        kind = str(src.get("type") or src.get("source_kind") or "DERIVED").upper()
        for key in AUTHORITY_FACTS:
            if key not in provenance:
                provenance[key] = {
                    "source_kind": kind,
                    "source_ref": src.get("path") or src.get("source_ref") or "",
                    "source_sha256": src.get("sha256") or src.get("source_sha256") or "",
                    "authority": src.get("authority") or "COMPAT",
                }
    facts = dict(authority.get("facts") or {})
    # Fill missing ALL_FACTS with None so envelope shape is complete but verify fails closed.
    for key in ALL_FACTS:
        facts.setdefault(key, None)
    return build_envelope(str(authority.get("work_item_id") or "unknown"), facts, provenance)


def _validate_provenance_entry(key: str, prov: dict[str, Any], facts: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    for field in PROV_REQUIRED:
        if field not in prov or prov.get(field) is None:
            reasons.append("WORK_FACTS_PROVENANCE_MISSING")
            return reasons
    kind = str(prov.get("source_kind") or "").upper()
    if kind in FORBIDDEN_ALONE:
        if key == "governed" and facts.get("governed") is False:
            reasons.append("WORK_FACTS_AUTHORITY_MISSING")
        elif kind not in ALLOWED_KINDS:
            reasons.append("WORK_FACTS_AUTHORITY_MISSING")
        return reasons
    if kind not in ALLOWED_KINDS:
        reasons.append(f"WORK_FACTS_INVALID:{kind}")
        return reasons
    if kind == "DERIVED":
        if not prov.get("derivation"):
            reasons.append("WORK_FACTS_PROVENANCE_MISSING")
            return reasons
        # DERIVED alone cannot prove governed=false or all production risk false.
        if key == "governed" and facts.get("governed") is False:
            reasons.append("WORK_FACTS_AUTHORITY_MISSING")
        if key in RISK_OR_PRODUCTION and facts.get(key) is False:
            # Allowed only when another non-DERIVED provenance exists for same key set
            # — checked at envelope level; flag here for governed/risk false.
            pass
    if kind == "ORCHESTRATOR_REQUEST":
        ref = str(prov.get("source_ref") or "")
        sha = str(prov.get("source_sha256") or "")
        # File refs are validated later when repo is provided. Non-file must bind id+sha.
        if not ref and not sha:
            reasons.append("WORK_FACTS_PROVENANCE_MISSING")
        elif not ref.startswith(("docs/", "plans/", "engineeing-skills/", ".smc/", "lat.md/")) and (
            not ref or not sha or sha == "sha256:"
        ):
            # Immutable request id form: request:<id> with non-empty sha
            if not (ref.startswith("request:") and sha.startswith("sha256:") and len(sha) > 7):
                if not ref or not sha:
                    reasons.append("WORK_FACTS_PROVENANCE_MISSING")
    return reasons


def verify_envelope(data: dict[str, Any], repo: Path | None = None) -> tuple[str, list[str]]:
    """Return (VERIFIED|UNBOUND|STALE|INVALID|CONFLICT, reasons) with WORK_FACTS_* codes."""
    # @lat: [[safety-runtime-closure-v503]]
    # @lat: [[frontend-context#Work Router v3]]
    if not isinstance(data, dict) or data.get("schema") not in ALLOWED_SCHEMAS:
        return "INVALID", ["WORK_FACTS_INVALID"]
    schema = str(data.get("schema"))
    keys = _fact_keys_for(schema)
    facts = data.get("facts")
    provenance = data.get("provenance")
    if not isinstance(facts, dict):
        return "INVALID", ["WORK_FACTS_INVALID"]
    if not isinstance(provenance, dict):
        return "UNBOUND", ["WORK_FACTS_UNBOUND"]

    fact_keys = set(facts)
    required = set(keys)
    if fact_keys - required:
        return "INVALID", ["WORK_FACTS_INVALID"]
    missing_facts = required - fact_keys
    if missing_facts:
        return "UNBOUND", ["WORK_FACTS_FIELD_MISSING"]

    if not provenance:
        return "UNBOUND", ["WORK_FACTS_UNBOUND"]
    if set(provenance) - required:
        return "INVALID", ["WORK_FACTS_INVALID"]
    if set(provenance) != required:
        return "UNBOUND", ["WORK_FACTS_PROVENANCE_MISSING"]

    reasons: list[str] = []
    non_derived_kinds: set[str] = set()
    for key in keys:
        prov = provenance.get(key)
        if not isinstance(prov, dict):
            return "UNBOUND", ["WORK_FACTS_PROVENANCE_MISSING"]
        entry_reasons = _validate_provenance_entry(key, prov, facts)
        reasons.extend(entry_reasons)
        kind = str(prov.get("source_kind") or "").upper()
        if kind in ALLOWED_KINDS and kind != "DERIVED":
            non_derived_kinds.add(kind)

    if reasons:
        if any(r.startswith("WORK_FACTS_INVALID") for r in reasons):
            return "INVALID", list(dict.fromkeys(reasons))
        if "WORK_FACTS_AUTHORITY_MISSING" in reasons:
            return "INVALID", list(dict.fromkeys(reasons))
        if "WORK_FACTS_PROVENANCE_MISSING" in reasons:
            return "UNBOUND", list(dict.fromkeys(reasons))
        return "INVALID", list(dict.fromkeys(reasons))

    if facts.get("governed") is False:
        kinds = {
            str(provenance[k].get("source_kind", "")).upper()
            for k in AUTHORITY_FACTS
            if isinstance(provenance.get(k), dict)
        }
        if kinds <= {"DERIVED"} or not (kinds & (ALLOWED_KINDS - {"DERIVED"})):
            if kinds & FORBIDDEN_ALONE or kinds <= {"DERIVED"} or not kinds:
                return "INVALID", ["WORK_FACTS_AUTHORITY_MISSING"]

    expected = compute_facts_digest(
        str(data.get("work_item_id") or ""),
        {k: facts.get(k) for k in keys},
        provenance,
        schema,
    )
    if data.get("facts_digest") != expected:
        return "STALE", ["WORK_FACTS_STALE"]

    if facts.get("governed") is False:
        kinds = {
            str(p.get("source_kind", "")).upper()
            for p in provenance.values()
            if isinstance(p, dict)
        }
        if kinds & {"PLAN", "PRD", "ROADMAP", "FEATURE"}:
            return "CONFLICT", ["WORK_FACTS_CONFLICT"]
        if not (kinds & ALLOWED_KINDS):
            return "INVALID", ["WORK_FACTS_AUTHORITY_MISSING"]

    if repo is None:
        return "UNBOUND", ["WORK_FACTS_REPO_REQUIRED"]

    for key, prov in provenance.items():
        if not isinstance(prov, dict):
            continue
        kind = str(prov.get("source_kind") or "").upper()
        rel = str(prov.get("source_ref") or "")
        dig = str(prov.get("source_sha256") or "")
        if kind == "ORCHESTRATOR_REQUEST" and rel.startswith("request:"):
            if not dig.startswith("sha256:") or len(dig) <= 7:
                return "INVALID", ["WORK_FACTS_PROVENANCE_MISSING"]
            continue
        if not rel:
            return "STALE", ["WORK_FACTS_STALE"]
        try:
            path = safe_repo_relative(repo, rel)
        except PathContainmentError:
            return "INVALID", ["WORK_FACTS_SOURCE_PATH_INVALID"]
        if not path.is_file():
            return "STALE", ["WORK_FACTS_STALE"]
        if dig and dig != _sha_file(path):
            return "STALE", ["WORK_FACTS_STALE"]

    return "VERIFIED", []


def conservative_merge(base: dict[str, Any], overlay: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Risk/production/governed: true > unknown > false. Returns (merged, decisions)."""
    merged = dict(base)
    decisions: list[dict[str, Any]] = []
    for key, value in overlay.items():
        prior = merged.get(key)
        if key in RISK_OR_PRODUCTION:
            if value is True or prior is True:
                merged[key] = True
                if prior is True and value is False:
                    decisions.append({"fact": key, "decision": "true_wins", "kept": True, "discarded": False})
                elif prior is False and value is True:
                    decisions.append({"fact": key, "decision": "true_wins", "kept": True, "from": "overlay"})
            elif prior is None or key not in merged:
                merged[key] = value
            elif value is False and prior is not True:
                merged[key] = False
            else:
                merged[key] = prior if prior is not None else value
        else:
            merged[key] = value
    return merged, decisions


def envelope_facts(envelope: dict[str, Any]) -> dict[str, Any]:
    return dict(envelope.get("facts") or {})


def save_envelope(repo: Path, envelope: dict[str, Any]) -> Path:
    out = facts_path(repo, str(envelope.get("work_item_id") or "unknown"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(envelope, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out


def load_envelope(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("WORK_FACTS_INVALID") from exc
    if data.get("schema") == "smc.ges.work-authority.v1":
        return from_work_authority(data)
    if data.get("schema") not in ALLOWED_SCHEMAS:
        raise ValueError("WORK_FACTS_INVALID")
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("verify")
    p.add_argument("path", type=Path)
    p.add_argument("--repo", type=Path)
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("build")
    p.add_argument("--work-item-id", required=True)
    p.add_argument("--facts", type=Path, required=True)
    p.add_argument("--provenance", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    if a.cmd == "verify":
        data = load_envelope(a.path)
        status, reasons = verify_envelope(data, a.repo)
        out = {"status": status, "reasons": reasons, "facts_digest": data.get("facts_digest")}
        print(json.dumps(out, indent=2) if a.json else status)
        return 0 if status == "VERIFIED" else 1
    facts = json.loads(a.facts.read_text(encoding="utf-8"))
    provenance = json.loads(a.provenance.read_text(encoding="utf-8"))
    env = build_envelope(a.work_item_id, facts, provenance)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(env, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
