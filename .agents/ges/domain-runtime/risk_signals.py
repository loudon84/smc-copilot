"""Shared structured risk runtime for PRD / Plan / Review.

Structured facts are the primary SOT. Negation-aware text hints only detect
contradictions or fill conservative fallback when structured facts are missing.

v5.0.6 Risk Facts v2 separates Sensitive Touch (LEAN-allowed) from Hard Boundary
Change (FULL-required). Legacy v1 `security_boundary=true` without v2 evidence
remains fail-safe high risk.
"""
from __future__ import annotations

import json
import re
from typing import Any

# Legacy v1 risk keys (still accepted).
RISK_KEYS = (
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

# @lat: [[frontend-context#Risk Facts v2]]
SENSITIVE_TOUCH_KEYS = (
    "security_sensitive_touch",
    "existing_lifecycle_wiring",
    "cross_layer_existing_contract",
    "local_ui_acceptance",
    "existing_public_contract_use",
    "existing_external_dependency_use",
)

HARD_BOUNDARY_KEYS = (
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

# Map legacy v1 keys onto hard-boundary equivalents when v2 keys are absent.
V1_TO_HARD = {
    "public_contract": "public_contract_change",
    "security_boundary": "security_boundary_change",
    "external_dependency": "external_dependency_change",
    "lifecycle_change": "lifecycle_contract_change",
    "cross_domain_ownership": "cross_domain_contract_change",
    "live_acceptance": "external_live_acceptance",
}

CAPABILITY_KEYS = (
    "existing_owner",
    "existing_capability",
    "bounded_writes",
    "deterministic_verification",
)

# Affirmative phrase patterns keyed by risk. Negation wrappers flip AFFIRMATIVE -> NEGATED.
AFFIRMATIVE_PATTERNS: dict[str, tuple[str, ...]] = {
    "new_owner": (r"\bnew\s+(service|store|client|protocol|owner)\b", r"\bintroduce\s+new\s+owner\b"),
    "public_contract": (r"\bpublic\s+(api|contract)\b", r"\bprotocol\s+change\b"),
    "security_boundary": (r"\b(auth|authentication|authorization)\s+boundary\b", r"\b(trust|security)\s+boundary\b"),
    "schema_migration": (r"\bschema\s+migration\b", r"\bdata\s+migration\b"),
    "protocol_change": (r"\bprotocol\s+change\b", r"\bbreaking\s+protocol\b"),
    "external_dependency": (r"\bnew\s+external\s+dependency\b", r"\badd\s+external\s+dependency\b"),
    "lifecycle_change": (r"\blifecycle\s+change\b", r"\bdeployment\s+lifecycle\b"),
    "cross_domain_ownership": (r"\bcross[- ]domain\s+ownership\b",),
    "live_acceptance": (r"\b\bLIVE\b", r"\bFAULT[_ ]?INJECTION\b", r"\bEXTERNAL\b"),
    "security_boundary_change": (
        r"\b(auth|authentication|authorization)\s+boundary\s+change\b",
        r"\b(trust|security)\s+boundary\s+change\b",
        r"\btoken\s+owner(ship)?\s+(change|transfer)\b",
    ),
    "public_contract_change": (r"\bpublic\s+(api|contract)\s+change\b",),
}


NEGATION = re.compile(
    r"\b(no|none|not|without|never|unchanged|not\s+required|is\s+not\s+required|does\s+not)\b",
    re.I,
)
AMBIGUOUS = re.compile(r"\b(tbd|unknown|maybe|possibly|unclear|undecided)\b", re.I)


def is_v2_facts(facts: dict[str, Any] | None) -> bool:
    """True when producer included at least one v2-only sensitive or hard key."""
    if not facts:
        return False
    v2_markers = set(SENSITIVE_TOUCH_KEYS) | set(HARD_BOUNDARY_KEYS) - set(RISK_KEYS)
    return any(k in facts for k in v2_markers)


def classify_text_hint(text: str, risk: str) -> str:
    """Return AFFIRMATIVE | NEGATED | AMBIGUOUS | ABSENT for one risk key."""
    patterns = AFFIRMATIVE_PATTERNS.get(risk, ())
    hits: list[tuple[int, int, str]] = []
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            hits.append((m.start(), m.end(), m.group(0)))
    if not hits:
        return "ABSENT"
    for start, end, _ in hits:
        window = text[max(0, start - 48) : min(len(text), end + 48)]
        if AMBIGUOUS.search(window):
            return "AMBIGUOUS"
        if NEGATION.search(window):
            return "NEGATED"
    return "AFFIRMATIVE"


def parse_routing_facts(section_text: str) -> dict[str, Any] | None:
    raw = section_text.strip()
    if raw.startswith("```"):
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    return value if isinstance(value, dict) else None


def parse_risk_snapshot(text: str) -> tuple[str, dict[str, Any] | None]:
    # @lat: [[acceptance-closure#Risk Snapshot Tri-State]]
    """Return (ABSENT|VALID|INVALID, facts_or_none)."""
    m = re.search(
        r"Risk Facts Snapshot:\s*`?(\{.*?\})`?",
        text,
        re.S,
    )
    if not m:
        m2 = re.search(
            r"##\s+Governance Profile\s*\n.*?Risk Facts Snapshot:\s*\n```json\s*(\{.*?\})\s*```",
            text,
            re.S | re.I,
        )
        if not m2:
            if re.search(r"Risk Facts Snapshot:", text, re.I):
                return "INVALID", None
            return "ABSENT", None
        blob = m2.group(1)
    else:
        blob = m.group(1)
    try:
        value = json.loads(blob)
    except json.JSONDecodeError:
        return "INVALID", None
    if not isinstance(value, dict):
        return "INVALID", None
    return "VALID", value


def extract_risk_snapshot(text: str) -> dict[str, Any] | None:
    """Read Plan Risk Facts Snapshot JSON if present and valid."""
    status, facts = parse_risk_snapshot(text)
    return facts if status == "VALID" else None


def _effective_hard_keys(facts: dict[str, Any]) -> dict[str, Any]:
    """Resolve hard-boundary flags, mapping v1 keys when v2 evidence is absent."""
    out: dict[str, Any] = {}
    v2 = is_v2_facts(facts)
    for key in HARD_BOUNDARY_KEYS:
        if key in facts:
            out[key] = facts.get(key)
            continue
        # Legacy v1 aliases.
        for v1, hard in V1_TO_HARD.items():
            if hard == key and v1 in facts:
                # Fail-safe: v1 security_boundary without v2 producer stays hard.
                if v1 == "security_boundary" and not v2:
                    out[key] = facts.get(v1)
                elif v1 == "security_boundary" and v2 and "security_boundary_change" not in facts:
                    # v2 producer present but omitted boundary_change — treat v1 as soft unless true
                    # with no sensitive_touch clarification.
                    if facts.get("security_sensitive_touch") is True and facts.get(v1) is not True:
                        out[key] = False
                    else:
                        out[key] = facts.get(v1)
                else:
                    out[key] = facts.get(v1)
                break
        else:
            if key == "new_owner" and "new_owner" in facts:
                out[key] = facts.get("new_owner")
            elif key in ("schema_migration", "protocol_change") and key in facts:
                out[key] = facts.get(key)
    return out


def structured_high_risk(facts: dict[str, Any] | None) -> tuple[bool, list[str]]:
    if facts is None:
        return True, ["RISK_FACTS_MISSING"]

    if is_v2_facts(facts):
        reasons: list[str] = []
        complete = True
        hard = _effective_hard_keys(facts)
        for key in HARD_BOUNDARY_KEYS:
            if key not in hard and key not in facts:
                # Optional when v2 present: only evaluate keys that were supplied or mapped.
                continue
            val = hard.get(key, facts.get(key))
            if val is True:
                reasons.append(key)
            elif val is not False and val is not None:
                complete = False
                reasons.append(f"RISK_FACTS_INVALID:{key}")
        # Also check v1 RISK_KEYS that weren't remapped if still true and no v2 override.
        for v1 in RISK_KEYS:
            if v1 in ("security_boundary",) and facts.get("security_boundary_change") is False:
                continue  # explicit v2 override
            if v1 in V1_TO_HARD:
                continue  # handled via hard map
            if facts.get(v1) is True:
                reasons.append(v1)
        if not complete and not reasons:
            return True, ["RISK_FACTS_INVALID"]
        return bool(reasons), [r for r in reasons if not str(r).startswith("RISK_FACTS_")]

    # Legacy v1 path.
    reasons = []
    complete = True
    for key in RISK_KEYS:
        if key not in facts:
            complete = False
            reasons.append(f"RISK_FACTS_MISSING:{key}")
            continue
        if facts.get(key) is True:
            reasons.append(key)
        elif facts.get(key) is not False:
            complete = False
            reasons.append(f"RISK_FACTS_INVALID:{key}")
    if not complete and not any(facts.get(k) is True for k in RISK_KEYS):
        return True, reasons or ["RISK_FACTS_INVALID"]
    return bool(reasons and any(facts.get(k) is True for k in RISK_KEYS)), [
        r for r in reasons if not r.startswith("RISK_FACTS_")
    ]


def contradiction_errors(facts: dict[str, Any] | None, text: str) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    if facts is None:
        return [{"code": "RISK_FACTS_MISSING", "detail": "structured facts unavailable"}]
    check_keys = list(RISK_KEYS)
    if is_v2_facts(facts):
        check_keys = list(dict.fromkeys([*RISK_KEYS, *HARD_BOUNDARY_KEYS]))
    for key in check_keys:
        if key not in facts and key not in AFFIRMATIVE_PATTERNS:
            continue
        hint = classify_text_hint(text, key if key in AFFIRMATIVE_PATTERNS else key)
        structured = facts.get(key)
        if structured is False and hint == "AFFIRMATIVE":
            errors.append({"code": "RISK_FACT_CONTRADICTION", "detail": key})
        if hint == "AMBIGUOUS":
            errors.append({"code": "RISK_TEXT_AMBIGUOUS", "detail": key})
    return errors


def resolve_risk(text: str, facts: dict[str, Any] | None) -> dict[str, Any]:
    # @lat: [[acceptance-hardening#Structured Risk Runtime]]
    # @lat: [[frontend-context#Risk Facts v2]]
    """Canonical resolver used by PRD / Plan / Review adapters."""
    errors: list[dict[str, str]] = []
    schema = "smc.ges.risk-resolve.v2" if is_v2_facts(facts) else "smc.ges.risk-resolve.v1"
    if facts is None:
        text_hits = []
        for key in RISK_KEYS:
            hint = classify_text_hint(text, key)
            if hint == "AFFIRMATIVE":
                text_hits.append(key)
            elif hint == "AMBIGUOUS":
                errors.append({"code": "RISK_TEXT_AMBIGUOUS", "detail": key})
        return {
            "schema": "smc.ges.risk-resolve.v1",
            "high_risk": True,
            "reasons": ["RISK_FACTS_MISSING"] + text_hits,
            "errors": [{"code": "RISK_FACTS_MISSING", "detail": "structured facts unavailable"}] + errors,
            "mode": "legacy_fallback",
            "sensitive_touch": [],
            "hard_boundary": [],
        }

    high, reasons = structured_high_risk(facts)
    errors.extend(contradiction_errors(facts, text))
    if errors:
        high = True
        reasons = reasons + [e["code"] + ":" + e["detail"] for e in errors]

    sensitive = [k for k in SENSITIVE_TOUCH_KEYS if facts.get(k) is True]
    hard = [k for k in HARD_BOUNDARY_KEYS if _effective_hard_keys(facts).get(k) is True or facts.get(k) is True]

    fact_payload = {k: facts.get(k) for k in RISK_KEYS}
    if is_v2_facts(facts):
        for k in (*SENSITIVE_TOUCH_KEYS, *HARD_BOUNDARY_KEYS):
            if k in facts:
                fact_payload[k] = facts.get(k)

    return {
        "schema": schema,
        "high_risk": high,
        "reasons": reasons,
        "errors": errors,
        "mode": "structured_v2" if is_v2_facts(facts) else "structured",
        "facts": fact_payload,
        "sensitive_touch": sensitive,
        "hard_boundary": hard,
    }


def acceptance_structure_clearance(text: str, facts: dict[str, Any] | None) -> tuple[bool, list[str]]:
    # @lat: [[acceptance-hardening#LEAN First Review Clearance]]
    """Deterministic LEAN first-review clearance for acceptance-governed plans."""
    reasons: list[str] = []
    if facts is None:
        return False, ["RISK_FACTS_MISSING"]
    high, high_reasons = structured_high_risk(facts)
    if high:
        return False, high_reasons
    if any(facts.get(k) is not True for k in CAPABILITY_KEYS):
        return False, ["CAPABILITY_FACTS_INCOMPLETE"]
    if re.search(r"\|\s*(LIVE|FAULT_INJECTION|EXTERNAL)\s*\|", text, re.I):
        return False, ["LIVE_OR_EXTERNAL_PRESENT"]
    if "Acceptance Claim Ledger" not in text and "acceptance_contract: smc.acceptance.v1" in text:
        if "## Acceptance Claim Ledger" not in text:
            return False, ["ACCEPTANCE_STRUCTURE_INCOMPLETE"]
    return True, reasons


def snapshot_json(facts: dict[str, Any]) -> str:
    keys = list(CAPABILITY_KEYS) + list(RISK_KEYS)
    if is_v2_facts(facts):
        keys = list(dict.fromkeys([*keys, *SENSITIVE_TOUCH_KEYS, *HARD_BOUNDARY_KEYS]))
    payload = {k: facts.get(k) for k in keys if k in facts or k in (*CAPABILITY_KEYS, *RISK_KEYS)}
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
