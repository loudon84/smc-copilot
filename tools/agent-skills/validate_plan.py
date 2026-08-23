#!/usr/bin/env python3
"""Validate an implementation plan against its approved PRD."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def approved_prd(plan: Path, text: str) -> Path | None:
    match = re.search(r"## Approved PRD\s*\n+.*?\]\(([^)]+)\)", text, re.DOTALL)
    if not match:
        return None
    return (plan.parent / match.group(1)).resolve()


def run_prd_validator(prd: Path) -> tuple[int, str]:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "agent-skills" / "validate_prd.py"), str(prd), "--require-approved"],
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout + result.stderr


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    plan = args.plan.resolve()
    text = plan.read_text(encoding="utf-8")
    errors: list[str] = []
    prd = approved_prd(plan, text)
    if prd is None or not prd.is_file():
        errors.append("PLAN_INVALID: missing resolvable Approved PRD link")
    else:
        code, output = run_prd_validator(prd)
        if code:
            errors.append(f"PLAN_PRD_INVALID: {output.strip()}")
    if "## Change Matrix" not in text:
        errors.append("PLAN_INVALID: missing Change Matrix")
    actions = re.findall(r"\|[^\n]*\|\s*(KEEP|MODIFY|ADD|REPLACE|REMOVE)\s*\|", text)
    if "REPLACE" in actions and "REMOVE" not in actions:
        errors.append("PLAN_REPLACEMENT_WITHOUT_REMOVAL")
    if "ADD" in actions and "## New File Justification" not in text:
        errors.append("PLAN_NEW_FILE_WITHOUT_JUSTIFICATION")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Plan validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
