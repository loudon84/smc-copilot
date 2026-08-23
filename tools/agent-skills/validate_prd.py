#!/usr/bin/env python3
"""Validate the minimum governance contract for an SMC PRD."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


STATUSES = {"DRAFT", "REVIEW_REQUIRED", "APPROVED", "SUPERSEDED"}
REQUIRED_FIELDS = {"work_item_id", "version", "status", "target_branch", "review_verdict", "approved_at"}
REQUIRED_SECTIONS = {
    "Current Capability Inventory",
    "Target End-State Inventory",
    "Change Classification",
    "Acceptance Criteria",
}


def frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("frontmatter missing")
    try:
        end = lines.index("---", 1)
    except ValueError as error:
        raise ValueError("frontmatter is not closed") from error
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()
    return fields


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("prd", type=Path)
    parser.add_argument("--require-approved", action="store_true")
    args = parser.parse_args()
    text = args.prd.read_text(encoding="utf-8")
    errors: list[str] = []
    try:
        fields = frontmatter(text)
    except ValueError as error:
        print(f"PRD_INVALID: {error}", file=sys.stderr)
        return 1
    for field in sorted(REQUIRED_FIELDS - set(fields)):
        errors.append(f"PRD_INVALID: missing {field}")
    if fields.get("status") not in STATUSES:
        errors.append("PRD_INVALID: status must be DRAFT, REVIEW_REQUIRED, APPROVED, or SUPERSEDED")
    if args.require_approved and fields.get("status") != "APPROVED":
        errors.append("PRD_NOT_APPROVED")
    for section in REQUIRED_SECTIONS:
        if f"## {section}" not in text:
            errors.append(f"PRD_INVALID: missing section {section}")
    classifications = re.findall(r"\|[^\n]*\|\s*(KEEP|MODIFY|ADD|REPLACE|REMOVE)\s*\|", text)
    if not classifications:
        errors.append("PRD_INVALID: Change Classification has no classified action")
    if "REPLACE" in classifications:
        if "## Replacement / Removal Matrix" not in text or "REMOVE" not in text[text.index("## Replacement / Removal Matrix"):]:
            errors.append("PRD_REPLACEMENT_WITHOUT_REMOVAL")
    if re.search(r"\b(legacy|compat|adapter|fallback|alias)\b", text, re.IGNORECASE):
        if "## Compatibility Contract" not in text:
            errors.append("PRD_COMPATIBILITY_WITHOUT_CONTRACT")
        else:
            section = text[text.index("## Compatibility Contract"):]
            for field in ("Current Consumer", "Reason", "Removal Condition", "Removal Version"):
                if field not in section:
                    errors.append(f"PRD_COMPATIBILITY_WITHOUT_{field.upper().replace(' ', '_')}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("PRD validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
