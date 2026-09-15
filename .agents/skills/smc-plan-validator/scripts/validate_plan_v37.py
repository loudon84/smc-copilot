#!/usr/bin/env python3
"""GES Plan v3.7 validator: v3.6 invariants + adaptive governance profile."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DELIVERY = HERE.parents[1] / "smc-plan-delivery" / "scripts"
sys.path.insert(0, str(DELIVERY))
from acceptance import validate_contract as validate_acceptance  # noqa: E402
from common import parse_top_level_frontmatter  # noqa: E402
from test_assets import validate_plan as validate_test_assets  # noqa: E402
from validate_plan_v33 import validate_plan  # noqa: E402

RUNTIME = HERE.parents[3] / "domain-runtime"
if not RUNTIME.is_dir():
    RUNTIME = HERE.parents[3] / ".agents" / "ges" / "domain-runtime"
sys.path.insert(0, str(RUNTIME))
from risk_signals import extract_risk_snapshot, resolve_risk  # noqa: E402


def repo_root(plan: Path) -> Path:
    for c in (plan.resolve().parent, *plan.resolve().parents):
        if (c / ".agents").is_dir() or (c / ".git").exists():
            return c
    raise ValueError("DOMAIN_REPO_ROOT_NOT_FOUND")


def domain_module(plan: Path):
    t = repo_root(plan) / ".agents/ges/domain-runtime/domain_runtime.py"
    if not t.is_file():
        raise ValueError(f"DOMAIN_RUNTIME_MISSING: {t}")
    s = importlib.util.spec_from_file_location("ges_domain_runtime_v37", t)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def ownership_errors(plan: Path) -> list[dict[str, str]]:
    # @lat: [[acceptance-closure#Executable Acceptance Evidence]]
    """FI-04: one production path#symbol has one Todo WRITE_OWNER."""
    from common import parse_first_table, section, strip_md

    text = plan.read_text(encoding="utf-8")
    errors: list[dict[str, str]] = []
    owners: dict[str, list[str]] = {}
    # Ownership Map table if present
    header, rows = parse_first_table(section(text, "Ownership Map"))
    if "Path / Symbol" in header and "WRITE_OWNER" in header:
        for row in rows:
            target = strip_md(row.get("Path / Symbol", "")).replace("\\", "/")
            owner = strip_md(row.get("WRITE_OWNER", ""))
            if not target or target.lower() in {"-", "none", "n/a"}:
                continue
            owners.setdefault(target, []).append(owner or "?")
    # Todo Writes scopes
    import re

    for m in re.finditer(r"^##\s+Todo\s+(T\d+)\b.*$", text, re.M | re.I):
        tid = m.group(1).upper()
        start = m.end()
        nxt = re.search(r"^##\s+Todo\s+T\d+\b", text[start:], re.M | re.I)
        body = text[start : start + nxt.start()] if nxt else text[start:]
        wm = re.search(
            r"^\*\*Writes(?::\*\*|\*\*:?)\s*([^\n]*)(.*?)(?=^\*\*|^##|\Z)",
            body,
            re.M | re.S | re.I,
        )
        if not wm:
            continue
        for raw in re.split(r"[,;\n]", wm.group(1) + wm.group(2)):
            x = re.sub(r"^\s*[-*]\s+", "", raw).strip().strip("`")
            x = x.split("#", 1)
            path = x[0].strip().replace("\\", "/")
            sym = x[1].strip() if len(x) > 1 else ""
            if not path or path.lower() in {"-", "none", "n/a"}:
                continue
            key = f"{path}#{sym}" if sym else path
            owners.setdefault(key, []).append(tid)
    for target, tids in owners.items():
        uniq = sorted(set(tids))
        if len(uniq) > 1:
            errors.append(
                {
                    "code": "PLAN_WRITE_OWNERSHIP_CONFLICT",
                    "detail": f"{target} owners={uniq}",
                }
            )
    return errors


def intent_binding_errors(plan: Path) -> list[dict[str, str]]:
    # @lat: [[safety-runtime-closure-v503]]
    text = plan.read_text(encoding="utf-8")
    meta = parse_top_level_frontmatter(text)
    if meta.get("plan_contract") and meta.get("plan_contract") != "smc.plan.v3.7":
        return []
    errors: list[dict[str, str]] = []
    required_meta = ("source_prd", "source_prd_sha256", "domain_activation_digest", "domain_intent_digest")
    placeholders = {"", "<GROUND>", "TODO", "TBD", "N/A", "NA", "-", "none", "null"}
    for key in required_meta:
        val = (meta.get(key) or "").strip()
        if not val or val.lower() in placeholders:
            errors.append({"code": "PLAN_DOMAIN_INTENT_BINDING_MISSING", "detail": key})
    if "Domain Intent Binding" not in text:
        errors.append({"code": "PLAN_DOMAIN_INTENT_BINDING_MISSING", "detail": "Domain Intent Binding section"})
    if errors:
        return errors
    prd_ref = meta.get("source_prd") or meta.get("prd_path")
    if not prd_ref:
        return [{"code": "PLAN_SOURCE_PRD_MISSING", "detail": "source_prd path"}]
    prd = Path(prd_ref)
    if not prd.is_file():
        prd = repo_root(plan) / prd_ref
    if not prd.is_file():
        return [{"code": "PLAN_SOURCE_PRD_STALE", "detail": f"prd missing: {prd_ref}"}]
    sys.path.insert(0, str(RUNTIME))
    from domain_intent import verify_bindings  # noqa: E402
    from domain_runtime import load_context  # noqa: E402

    packs = load_context(repo_root(plan))["packs"]
    return verify_bindings(plan, prd, packs)


def profile_errors(plan: Path) -> list[dict[str, str]]:
    text = plan.read_text(encoding="utf-8")
    meta = parse_top_level_frontmatter(text)
    errs: list[dict[str, str]] = []
    profile = meta.get("governance_profile", "").upper()
    if profile not in {"LEAN", "FULL"}:
        errs.append({"code": "PLAN_GOVERNANCE_PROFILE_INVALID", "detail": profile or "missing"})
        return errs
    snapshot = extract_risk_snapshot(text)
    risk = resolve_risk(text, snapshot)
    if profile == "LEAN" and risk["high_risk"]:
        errs.append({"code": "PLAN_LEAN_FULL_REQUIRED", "detail": ",".join(risk["reasons"])})
    for err in risk.get("errors", []):
        if err["code"] in {"RISK_FACT_CONTRADICTION", "RISK_TEXT_AMBIGUOUS"}:
            errs.append(err)
        if snapshot is None and profile == "LEAN":
            pass
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("plan", type=Path)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    p = a.plan.resolve()
    if not p.is_file():
        out = {"valid": False, "plan": str(p), "errors": [{"code": "PLAN_NOT_FOUND", "detail": str(p)}]}
        print(json.dumps(out, indent=2) if a.json else f"PLAN_NOT_FOUND: {p}")
        return 2
    errors = validate_plan(p, "smc.plan.v3.7")
    errors.extend(validate_acceptance(p))
    errors.extend(validate_test_assets(p))
    errors.extend(profile_errors(p))
    errors.extend(ownership_errors(p))
    errors.extend(intent_binding_errors(p))
    try:
        errors.extend(domain_module(p).validate_plan(p))
    except ValueError as e:
        errors.append({"code": str(e).split(":", 1)[0], "detail": str(e)})
    out = {"valid": not errors, "plan": str(p), "errors": errors}
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    elif errors:
        print("\n".join(f"{x['code']}: {x['detail']}" for x in errors), file=sys.stderr)
    else:
        print("Plan v3.7 validation passed")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
