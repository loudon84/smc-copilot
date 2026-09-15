#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
RUNTIME = ROOT / ".agents/ges/domain-runtime"
if not RUNTIME.is_dir():
    RUNTIME = ROOT / "domain-runtime"
sys.path.insert(0, str(RUNTIME))
from domain_table import apply_row_rules, validate_enum_or_na, validate_table  # noqa: E402

REQ = [
    "Change ID",
    "Surface",
    "Framework",
    "Composition",
    "State Ownership",
    "Design System",
    "Accessibility",
    "Interaction States",
    "Performance",
    "Visual Verification",
]
FRAMEWORKS = {"REACT", "VUE", "GENERIC", "N/A", "NA"}
VISUAL = {"STATIC", "COMPONENT", "INTERACTION", "LIVE_VISUAL", "N/A", "NA"}


def semantic(row, index):
    errors = []
    errors.extend(validate_enum_or_na(row, "Framework", FRAMEWORKS, "FRONTEND_REVIEW", index))
    errors.extend(validate_enum_or_na(row, "Visual Verification", VISUAL, "FRONTEND_REVIEW", index))
    return errors


def validate(p):
    required = list(REQ)
    if "smc.plan.v3.7" not in p.read_text(encoding="utf-8"):
        required.remove("Framework")
    errors = validate_table(p, "Frontend Quality Ledger", required, "FRONTEND_REVIEW")
    if "Framework" in required:
        errors.extend(apply_row_rules(p, "Frontend Quality Ledger", "FRONTEND_REVIEW", semantic))
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
