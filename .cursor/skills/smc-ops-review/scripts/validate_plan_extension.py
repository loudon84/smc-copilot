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
from domain_table import apply_row_rules, validate_enum, validate_table  # noqa: E402

REQ = [
    "Change ID",
    "Deployment Impact",
    "Compatibility",
    "Environment/Config",
    "Health",
    "Migration Order",
    "Rollback",
    "Verification",
]
IMPACT = {"NONE", "CONFIG_ONLY", "RESTART", "ROLLING_CHANGE", "TOPOLOGY_CHANGE", "IRREVERSIBLE"}
COMPAT = {"UNCHANGED", "BACKWARD_COMPATIBLE", "WINDOW_REQUIRED", "BREAKING"}


def semantic(row, index):
    errors = []
    errors.extend(validate_enum(row, "Deployment Impact", IMPACT, "OPS_REVIEW", index))
    errors.extend(validate_enum(row, "Compatibility", COMPAT, "OPS_REVIEW", index))
    return errors


def validate(p):
    errors = validate_table(p, "Ops Quality Ledger", list(REQ), "OPS_REVIEW")
    errors.extend(apply_row_rules(p, "Ops Quality Ledger", "OPS_REVIEW", semantic))
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
