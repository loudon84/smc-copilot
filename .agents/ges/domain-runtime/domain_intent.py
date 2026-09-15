#!/usr/bin/env python3
"""Domain Intent Binding: Approved PRD projection hashed into Plan (not a second SOT)."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from domain_runtime import markdown_table, section, sha256_json
from domain_table import _token, parse_table

BINDING_SCHEMA = "smc.ges.domain-intent-binding.v1"
BINDING_VERSION = "1"
EMPTY_INTENT_DIGEST = sha256_json({"bindings": []})
PLACEHOLDERS = frozenset({"", "<GROUND>", "TODO", "TBD", "N/A", "NA", "-", "none", "null"})


def _field_map(pack: dict[str, Any]) -> tuple[str, str, dict[str, str]]:
    """Return (preplan_section, plan_section, {prd_field: plan_column}).

    Supports PRD-canonical intent_bindings and legacy intent_binding.fields.
    """
    # New shape
    bindings = pack.get("intent_bindings")
    if isinstance(bindings, dict) and bindings:
        preplan = pack.get("preplan_section") or ""
        plan_section = (pack.get("plan_extension") or {}).get("section") or ""
        # optional nested meta
        if "preplan_section" in bindings and isinstance(bindings.get("preplan_section"), str):
            preplan = bindings["preplan_section"]
            fields = {k: v for k, v in bindings.items() if k not in {"preplan_section", "plan_section"} and isinstance(v, dict)}
            plan_section = bindings.get("plan_section") or plan_section
        else:
            fields = {k: v for k, v in bindings.items() if isinstance(v, dict)}
        field_map = {
            k: str(v.get("plan_column") or k)
            for k, v in fields.items()
        }
        return str(preplan), str(plan_section), field_map
    # Legacy shape
    binding = pack.get("intent_binding") or {}
    preplan = binding.get("preplan_section") or pack.get("preplan_section") or ""
    plan_section = binding.get("plan_section") or (pack.get("plan_extension") or {}).get("section") or ""
    fields = binding.get("fields") or {}
    return str(preplan), str(plan_section), {k: str(v) for k, v in fields.items()}


def normalize_row(row: dict[str, str], fields: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for field in fields:
        raw = row.get(field, "")
        out[field] = _token(raw) if field != "Change ID" else row.get("Change ID", "").strip().upper()
    return out


def normalize_domain_intent(domain: str, change_id: str, row: dict[str, str], fields: list[str]) -> dict[str, Any]:
    return {"domain": domain, "change_id": change_id, "fields": normalize_row(row, fields)}


def domain_intent_digest(domain: str, change_id: str, normalized: dict[str, str]) -> str:
    return intent_hash(domain, change_id, normalized)


def intent_hash(domain: str, change_id: str, normalized: dict[str, str]) -> str:
    payload = {"domain": domain, "change_id": change_id, "fields": normalized}
    return sha256_json(payload)


def source_prd_sha256(prd: Path) -> str:
    return "sha256:" + hashlib.sha256(prd.read_bytes()).hexdigest()


def extract_intent_rows(prd: Path, preplan_section: str, fields: list[str]) -> list[dict[str, str]]:
    _, rows = parse_table(prd, preplan_section)
    out = []
    for row in rows:
        cid = row.get("Change ID", "").strip().upper()
        if not cid:
            continue
        out.append({"change_id": cid, **normalize_row(row, fields)})
    return out


def binding_table(rows: list[dict[str, str]]) -> str:
    lines = [
        "## Domain Intent Binding",
        "",
        "| Domain | Change ID | Intent SHA256 | Source PRD SHA256 |",
        "|---|---|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| {row['domain']} | {row['change_id']} | `{row['intent_sha256']}` | `{row['source_prd_sha256']}` |"
        )
    return "\n".join(lines) + "\n"


def build_bindings(prd: Path, packs: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    # @lat: [[acceptance-closure#Canonical Digests]]
    prd_sha = source_prd_sha256(prd)
    out: list[dict[str, str]] = []
    for domain_id, pack in sorted(packs.items()):
        preplan, _plan_section, field_map = _field_map(pack)
        fields = list(field_map.keys())
        if not preplan or not fields:
            continue
        for row in extract_intent_rows(prd, str(preplan), fields):
            cid = row.pop("change_id")
            out.append(
                {
                    "domain": domain_id,
                    "change_id": cid,
                    "intent_sha256": intent_hash(domain_id, cid, row),
                    "source_prd_sha256": prd_sha,
                }
            )
    return out


def aggregate_intent_digest(prd: Path, packs: dict[str, dict[str, Any]]) -> str:
    rows = build_bindings(prd, packs)
    return sha256_json({"bindings": rows})


def canonical_empty_binding() -> dict[str, str]:
    # @lat: [[safety-runtime-closure-v503]]
    """No-domain Plan still binds canonical empty intent + activation=NONE."""
    return {
        "activation": "NONE",
        "domain_activation_digest": sha256_json({"activation": "NONE", "domains": []}),
        "domain_intent_digest": EMPTY_INTENT_DIGEST,
        "binding_table": (
            "## Domain Intent Binding\n\n"
            "| Domain | Change ID | Intent SHA256 | Source PRD SHA256 |\n"
            "|---|---|---|---|\n"
            "| NONE | — | `{digest}` | — |\n".format(digest=EMPTY_INTENT_DIGEST)
        ),
    }


def activation_digest(activation: dict[str, Any] | None) -> str:
    if not activation or not activation.get("domains"):
        return canonical_empty_binding()["domain_activation_digest"]
    return sha256_json(
        {
            "activation": activation.get("schema") or "smc.ges.domain-activation.v2",
            "domains": sorted(
                [
                    {"id": d.get("id"), "triggers": d.get("trigger_changes") or []}
                    for d in activation.get("domains") or []
                ],
                key=lambda x: str(x.get("id") or ""),
            ),
        }
    )


def parse_binding_table(plan_text: str) -> list[dict[str, str]]:
    rows = markdown_table(section(plan_text, "Domain Intent Binding"))
    out = []
    for row in rows:
        out.append(
            {
                "domain": row.get("Domain", "").strip(),
                "change_id": row.get("Change ID", "").strip().upper(),
                "intent_sha256": row.get("Intent SHA256", "").strip().strip("`"),
                "source_prd_sha256": row.get("Source PRD SHA256", "").strip().strip("`"),
            }
        )
    return out


def map_ledger_value(domain: str, field: str, value: str, binding: dict[str, Any]) -> str:
    aliases = binding.get("plan_field_aliases") or {}
    if field in aliases:
        field = aliases[field]
    return _token(value)


def validate_intent_binding(plan: Path, prd: Path, packs: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    return verify_bindings(plan, prd, packs)


def verify_bindings(
    plan: Path,
    prd: Path,
    packs: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    # @lat: [[acceptance-closure#Domain Intent Binding]]
    # @lat: [[domain-packs#Intent Binding]]
    # @lat: [[governance-architecture-closure]]
    errors: list[dict[str, str]] = []
    text = plan.read_text(encoding="utf-8")
    meta_m = re.search(r"^source_prd_sha256:\s*(.+)$", text, re.M)
    expected_prd_sha = source_prd_sha256(prd)
    if not meta_m:
        errors.append({"code": "PLAN_SOURCE_PRD_MISSING", "detail": "source_prd_sha256"})
    elif meta_m.group(1).strip().strip('"') != expected_prd_sha:
        errors.append({"code": "PLAN_SOURCE_PRD_STALE", "detail": "source_prd_sha256 mismatch"})
    elif expected_prd_sha != ("sha256:" + hashlib.sha256(prd.read_bytes()).hexdigest()):
        errors.append({"code": "PRD_STALE_OR_CONFLICTING", "detail": "source PRD bytes changed"})

    digest_m = re.search(r"^domain_intent_digest:\s*(.+)$", text, re.M)
    expected_digest = aggregate_intent_digest(prd, packs)
    if digest_m and digest_m.group(1).strip().strip('"') != expected_digest:
        errors.append({"code": "PLAN_DOMAIN_INTENT_STALE", "detail": "domain_intent_digest mismatch"})

    recorded = {(r["domain"], r["change_id"]): r for r in parse_binding_table(text)}
    expected = {(r["domain"], r["change_id"]): r for r in build_bindings(prd, packs)}
    if not recorded and expected:
        errors.append({"code": "PLAN_SOURCE_PRD_MISSING", "detail": "Domain Intent Binding"})
        return errors
    for key, exp in expected.items():
        act = recorded.get(key)
        if not act:
            errors.append({"code": "PLAN_DOMAIN_INTENT_STALE", "detail": f"missing {key[0]}/{key[1]}"})
            continue
        if act["intent_sha256"] != exp["intent_sha256"] or act["source_prd_sha256"] != exp["source_prd_sha256"]:
            errors.append({"code": "PLAN_DOMAIN_INTENT_STALE", "detail": f"intent hash {key[0]}/{key[1]}"})

    for domain_id, pack in packs.items():
        preplan, plan_section, field_map = _field_map(pack)
        if not plan_section or not field_map:
            continue
        _, prd_rows = parse_table(prd, str(preplan))
        prd_by_id = {r.get("Change ID", "").strip().upper(): r for r in prd_rows}
        _, plan_rows = parse_table(plan, str(plan_section))
        for prow in plan_rows:
            cid = prow.get("Change ID", "").strip().upper()
            prow_src = prd_by_id.get(cid)
            if not prow_src:
                continue
            for prd_field, plan_field in field_map.items():
                actual_field = plan_field
                if actual_field not in prow and actual_field == "Live Verification" and "Verification" in prow:
                    actual_field = "Verification"
                if actual_field not in prow and plan_field == "Verification" and "Verification" in prow:
                    actual_field = "Verification"
                if actual_field not in prow:
                    continue
                left = _token(prow_src.get(prd_field, ""))
                right = _token(prow.get(actual_field, ""))
                if left and right and left != right and left not in {"N/A", "NA"} and right not in {"N/A", "NA"}:
                    errors.append(
                        {
                            "code": "PRD_STALE_OR_CONFLICTING",
                            "detail": f"{domain_id}/{cid} {prd_field}:{left} vs {actual_field}:{right}",
                        }
                    )
    return errors
