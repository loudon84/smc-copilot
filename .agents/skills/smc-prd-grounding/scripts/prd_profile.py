#!/usr/bin/env python3
"""Validate GES 5 PRD governance profile and clarification readiness."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROFILES = {"LEAN", "FULL"}
RUNTIME = Path(__file__).resolve().parents[4] / "domain-runtime"
if not RUNTIME.is_dir():
    RUNTIME = Path(__file__).resolve().parents[4] / ".agents" / "ges" / "domain-runtime"
sys.path.insert(0, str(RUNTIME))
from risk_signals import parse_routing_facts, resolve_risk  # noqa: E402


def fm(t: str) -> dict[str, str]:
    out: dict[str, str] = {}
    lines = t.splitlines()
    if not lines or lines[0].strip() != "---":
        return out
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line and not line[0].isspace() and ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip("\"'")
    return out


def section(t: str, h: str) -> str:
    m = re.search(rf"^##\s+{re.escape(h)}\s*$\n?(.*?)(?=^##\s+|\Z)", t, re.M | re.S)
    return m.group(1).strip() if m else ""


def table(body: str) -> list[dict[str, str]]:
    lines = [x.strip() for x in body.splitlines() if x.strip().startswith("|")]
    if len(lines) < 2:
        return []
    hdr = [x.strip() for x in lines[0].strip("|").split("|")]
    rows = []
    for raw in lines[2:]:
        vals = [x.strip() for x in raw.strip("|").split("|")]
        if len(vals) == len(hdr):
            rows.append(dict(zip(hdr, vals)))
    return rows


def scan(path: Path) -> dict:
    t = path.read_text(encoding="utf-8")
    meta = fm(t)
    profile = meta.get("governance_profile", "").upper()
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if profile not in PROFILES:
        errors.append({"code": "PRD_GOVERNANCE_PROFILE_INVALID", "detail": profile or "missing"})
    for heading in (
        "Objective",
        "Out of Scope",
        "Production Owner",
        "Change Classification",
        "Acceptance Criteria",
        "Source Anchors",
    ):
        if not section(t, heading):
            errors.append({"code": "PRD_MINIMUM_SECTION_MISSING", "detail": heading})
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", meta.get("grounded_commit", "")):
        errors.append({"code": "PRD_GROUNDED_COMMIT_MISSING", "detail": "grounded_commit"})
    if meta.get("previous_governance_profile", "").upper() == "FULL" and profile != "FULL":
        errors.append({"code": "PRD_PROFILE_DOWNGRADE_FORBIDDEN", "detail": profile})

    facts = parse_routing_facts(section(t, "Routing Facts"))
    risk = resolve_risk(t, facts)
    hard = [r for r in risk.get("reasons", []) if not str(r).startswith("RISK_")]

    if profile == "LEAN":
        router = Path(__file__).resolve().parents[2] / "smc-work-router" / "scripts"
        sys.path.insert(0, str(router))
        from work_router import route

        if facts is None:
            errors.append({"code": "PRD_ROUTING_FACTS_INVALID", "detail": "LEAN needs explicit booleans"})
        else:
            try:
                if route(facts).get("governance_profile") == "FULL":
                    errors.append({"code": "PRD_LEAN_FULL_REQUIRED", "detail": "routing facts"})
            except (ValueError, TypeError):
                errors.append({"code": "PRD_ROUTING_FACTS_INVALID", "detail": "LEAN needs explicit booleans"})
        if risk["high_risk"]:
            errors.append({"code": "PRD_LEAN_FULL_REQUIRED", "detail": ",".join(risk["reasons"])})
        for err in risk.get("errors", []):
            if err["code"] in {"RISK_FACT_CONTRADICTION", "RISK_TEXT_AMBIGUOUS", "RISK_FACTS_MISSING"}:
                errors.append({"code": err["code"], "detail": err["detail"]})

    rows = table(section(t, "Clarification Ledger"))
    if section(t, "Clarification Ledger") and not rows:
        errors.append({"code": "PRD_CLARIFICATION_TABLE_INVALID", "detail": "nonempty ledger must have rows"})
    for r in rows:
        if r.get("Impact", "").upper() not in {"HIGH", "MEDIUM", "LOW"} or r.get("Status", "").upper() not in {
            "OPEN",
            "CLOSED",
        }:
            errors.append({"code": "PRD_CLARIFICATION_ROW_INVALID", "detail": str(r)})
    open_high = [r for r in rows if r.get("Impact", "").upper() == "HIGH" and r.get("Status", "").upper() != "CLOSED"]
    if open_high:
        errors.append(
            {"code": "PRD_CLARIFICATION_OPEN_HIGH", "detail": ",".join(r.get("ID", "?") for r in open_high)}
        )
    placeholders = []
    for token in ("NEEDS CLARIFICATION", "<DECIDE>", "TBD", "???"):
        if token.lower() in t.lower():
            placeholders.append(token)
    if placeholders:
        warnings.append({"code": "PRD_AMBIGUITY_MARKERS", "detail": ",".join(placeholders)})
    return {
        "schema": "smc.ges.prd-profile-check.v2",
        "valid": not errors,
        "profile": profile,
        "hard_full_signals": hard,
        "risk": risk,
        "errors": errors,
        "warnings": warnings,
        "clarification_rows": len(rows),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("scan")
    p.add_argument("prd", type=Path)
    p.add_argument("--json", action="store_true")
    a = ap.parse_args()
    o = scan(a.prd)
    if a.json:
        print(json.dumps(o, ensure_ascii=False, indent=2))
    else:
        print(
            "PRD profile ready"
            if o["valid"]
            else "\n".join(x["code"] + ": " + x["detail"] for x in o["errors"])
        )
    return 0 if o["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
