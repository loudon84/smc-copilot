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
from domain_table import _token, apply_row_rules, parse_table, validate_enum_or_na, validate_table  # noqa: E402

REQ = [
    "Change ID",
    "Owner",
    "Contract",
    "Data/Transaction",
    "Auth",
    "Idempotency/Concurrency",
    "Failure Semantics",
    "Observability",
]
CONTRACT = {"UNCHANGED", "COMPATIBLE_EXTEND", "BREAKING_CHANGE", "N/A", "NA"}
AUTH = {"UNCHANGED", "NONE", "MODIFY", "NEW_BOUNDARY", "N/A", "NA"}
DATA = {"NONE", "READ_ONLY", "WRITE", "TRANSACTIONAL", "MIGRATION", "N/A", "NA"}
IDEMP = {"NOT_APPLICABLE", "UNCHANGED", "REQUIRED", "MODIFIED", "N/A", "NA"}


def _profile(path: Path) -> str:
    m = re.search(r"^governance_profile:\s*(\w+)", path.read_text(encoding="utf-8"), re.M)
    return (m.group(1) if m else "FULL").upper()


def semantic(row: dict[str, str], index: int) -> list[dict[str, str]]:
    errors = []
    for field, allowed in (
        ("Contract", CONTRACT),
        ("Auth", AUTH),
        ("Data/Transaction", DATA),
        ("Idempotency/Concurrency", IDEMP),
    ):
        before = len(errors)
        errors.extend(validate_enum_or_na(row, field, allowed, "BACKEND_PREPLAN", index))
        if len(errors) > before and row.get(field, "").strip() and _token(row.get(field, "")) not in allowed:
            # free-text token on new artifact
            errors[-1] = {"code": "DOMAIN_SEMANTIC_TOKEN_INVALID", "detail": f"row={index} {field}={row.get(field)}"}
    return errors


def validate(p: Path):
    errors = validate_table(p, "Backend Design Intent", list(REQ), "BACKEND_PREPLAN")
    _, rows = parse_table(p, "Backend Design Intent")
    if not rows and "## Backend Design Intent" in p.read_text(encoding="utf-8"):
        errors.append({"code": "DOMAIN_SEMANTIC_LEGACY_FULL_REQUIRED", "detail": "unstructured backend intent"})
        return errors
    errors.extend(apply_row_rules(p, "Backend Design Intent", "BACKEND_PREPLAN", semantic))
    if _profile(p) == "LEAN":
        text = p.read_text(encoding="utf-8")
        # Structured Routing Facts may also force FULL (PRD §11.3).
        for key in ("new_owner", "external_dependency", "protocol_change"):
            if re.search(rf"{key}\s*[:=]\s*true", text, re.I):
                errors.append({"code": "BACKEND_PREPLAN_FULL_REQUIRED", "detail": f"routing_fact:{key}"})
                return errors
        for index, row in enumerate(rows, 1):
            if (
                _token(row.get("Contract", "")) == "BREAKING_CHANGE"
                or _token(row.get("Auth", "")) == "NEW_BOUNDARY"
                or _token(row.get("Data/Transaction", "")) == "MIGRATION"
            ):
                errors.append({"code": "BACKEND_PREPLAN_FULL_REQUIRED", "detail": f"row={index} structured FULL trigger"})
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
