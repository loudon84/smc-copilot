#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
RUNTIME = ROOT / ".agents/ges/domain-runtime"
if not RUNTIME.is_dir():
    RUNTIME = ROOT / "domain-runtime"
sys.path.insert(0, str(RUNTIME))
from domain_table import (  # noqa: E402
    _token,
    apply_row_rules,
    parse_table,
    validate_enum,
    validate_na_with_reason,
    validate_table,
)

REQ = [
    "Change ID",
    "Deployment Impact",
    "Compatibility",
    "Environment/Config",
    "Health",
    "Migration Order",
    "Rollback",
    "Live Verification",
]
IMPACT = {"NONE", "CONFIG_ONLY", "RESTART", "ROLLING_CHANGE", "TOPOLOGY_CHANGE", "IRREVERSIBLE"}
COMPAT = {"UNCHANGED", "BACKWARD_COMPATIBLE", "WINDOW_REQUIRED", "BREAKING"}
LIVE = {"NOT_REQUIRED", "STATIC", "SMOKE", "LIVE", "EXTERNAL"}


def _profile(path: Path) -> str:
    m = re.search(r"^governance_profile:\s*(\w+)", path.read_text(encoding="utf-8"), re.M)
    return (m.group(1) if m else "FULL").upper()


def semantic(row: dict[str, str], index: int) -> list[dict[str, str]]:
    errors = []
    for field, allowed, fn in (
        ("Deployment Impact", IMPACT, validate_enum),
        ("Compatibility", COMPAT, validate_enum),
        ("Live Verification", LIVE, validate_enum),
    ):
        before = len(errors)
        errors.extend(fn(row, field, allowed, "OPS_PREPLAN", index))
        if len(errors) > before and row.get(field, "").strip() and _token(row.get(field, "")) not in allowed:
            errors[-1] = {"code": "DOMAIN_SEMANTIC_TOKEN_INVALID", "detail": f"row={index} {field}={row.get(field)}"}
    impact = _token(row.get("Deployment Impact", ""))
    rollback = row.get("Rollback", "").strip()
    if impact != "NONE":
        if not rollback or _token(rollback) in {"N/A", "NA"}:
            if not rollback.upper().startswith("NOT_POSSIBLE"):
                errors.append(
                    {
                        "code": "OPS_PREPLAN_ROLLBACK_REQUIRED",
                        "detail": f"row={index} Rollback required when Deployment Impact != NONE",
                    }
                )
    if impact == "IRREVERSIBLE":
        if not rollback.upper().startswith("NOT_POSSIBLE:"):
            errors.append(
                {
                    "code": "OPS_PREPLAN_ROLLBACK_REQUIRED",
                    "detail": f"row={index} IRREVERSIBLE requires Rollback=NOT_POSSIBLE:<reason>",
                }
            )
        errors.extend(validate_na_with_reason(row, "Migration Order", "OPS_PREPLAN", index, allow_bare_na=False))
    # Migration applies when impact implies migration / irreversible / topology change
    if impact in {"IRREVERSIBLE", "TOPOLOGY_CHANGE", "ROLLING_CHANGE"}:
        mig = row.get("Migration Order", "").strip()
        if not mig or _token(mig) in {"N/A", "NA"}:
            # N/A requires reason; bare N/A or empty when migration applies is invalid
            if not mig or (":" not in mig and "(" not in mig):
                errors.append(
                    {
                        "code": "OPS_PREPLAN_ENUM_INVALID",
                        "detail": f"row={index} Migration Order must be structured non-N/A when migration applies",
                    }
                )
    return errors


def validate(p: Path):
    errors = validate_table(p, "Ops Design Intent", list(REQ), "OPS_PREPLAN")
    _, rows = parse_table(p, "Ops Design Intent")
    if not rows and "## Ops Design Intent" in p.read_text(encoding="utf-8"):
        errors.append({"code": "DOMAIN_SEMANTIC_LEGACY_FULL_REQUIRED", "detail": "unstructured ops intent"})
        return errors
    errors.extend(apply_row_rules(p, "Ops Design Intent", "OPS_PREPLAN", semantic))
    if _profile(p) == "LEAN":
        for index, row in enumerate(rows, 1):
            impact = _token(row.get("Deployment Impact", ""))
            compat = _token(row.get("Compatibility", ""))
            live = _token(row.get("Live Verification", ""))
            if impact in {"TOPOLOGY_CHANGE", "IRREVERSIBLE"} or compat == "BREAKING" or live in {"LIVE", "EXTERNAL"}:
                errors.append({"code": "OPS_PREPLAN_FULL_REQUIRED", "detail": f"row={index} structured FULL trigger"})
                break
    return errors


val = validate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    errors = validate(a.path)
    print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
