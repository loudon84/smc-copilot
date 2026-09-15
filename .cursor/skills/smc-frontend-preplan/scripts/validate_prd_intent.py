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
    validate_enum_or_na,
    validate_table,
)

REQ = [
    "Change ID",
    "Surface",
    "Framework",
    "Layout",
    "Component Map",
    "State Ownership",
    "Interaction States",
    "Design System",
    "Responsive",
    "Visual Verification",
]
# Canonical (PRD §11.2) + deprecated aliases still readable.
FRAMEWORKS = {"REACT", "VUE", "GENERIC", "N/A", "NA"}
LAYOUT_CANONICAL = {"UNCHANGED", "MODIFY", "NEW_HIERARCHY", "N/A", "NA"}
LAYOUT_ALIAS = {
    "EXTEND_EXISTING": "MODIFY",
    "NAVIGATION_CHANGE": "NEW_HIERARCHY",
    "MULTI_PANEL": "NEW_HIERARCHY",
}
LAYOUT = LAYOUT_CANONICAL | set(LAYOUT_ALIAS)
COMPONENT = {"REUSE", "EXTEND", "NEW", "REMOVE", "N/A", "NA"}
STATE_CANONICAL = {"UNCHANGED", "LOCAL", "SHARED", "NEW_OWNER", "MOVE_OWNER", "N/A", "NA"}
STATE_ALIAS = {
    "LOCAL_EXISTING": "LOCAL",
    "EXTEND_OWNER": "SHARED",
    "STORE_CHANGE": "MOVE_OWNER",
}
STATE = STATE_CANONICAL | set(STATE_ALIAS)
RESPONSIVE_CANONICAL = {"UNCHANGED", "MODIFY", "NEW_ARCHITECTURE", "N/A", "NA"}
RESPONSIVE_ALIAS = {"EXTEND": "MODIFY", "ARCHITECTURE_CHANGE": "NEW_ARCHITECTURE"}
RESPONSIVE = RESPONSIVE_CANONICAL | set(RESPONSIVE_ALIAS)
VISUAL = {"STATIC", "COMPONENT", "INTERACTION", "LIVE_VISUAL", "N/A", "NA"}
DETAIL_REQUIRED = {"MODIFY", "NEW_HIERARCHY", "NEW_ARCHITECTURE", "MOVE_OWNER", "LOCAL", "SHARED", "NEW_OWNER"}


def _profile(path: Path) -> str:
    m = re.search(r"^governance_profile:\s*(\w+)", path.read_text(encoding="utf-8"), re.M)
    return (m.group(1) if m else "FULL").upper()


def _normalize_token(raw: str, alias: dict[str, str]) -> str:
    tok = _token(raw)
    return alias.get(tok, tok)


def _require_detail(raw: str, token: str, field: str, index: int) -> list[dict[str, str]]:
    if token in DETAIL_REQUIRED and token not in {"N/A", "NA", "UNCHANGED"}:
        # UNCHANGED may be bare; MODIFY/NEW_* / MOVE_OWNER / LOCAL/SHARED/NEW_OWNER need :<detail>
        if token in {"MODIFY", "NEW_HIERARCHY", "NEW_ARCHITECTURE", "MOVE_OWNER", "LOCAL", "SHARED", "NEW_OWNER"}:
            if ":" not in raw.strip().strip("`"):
                # aliases without detail still accepted as deprecated readable form
                if _token(raw) in LAYOUT_ALIAS or _token(raw) in STATE_ALIAS or _token(raw) in RESPONSIVE_ALIAS:
                    return []
                return [{"code": "DOMAIN_SEMANTIC_TOKEN_INVALID", "detail": f"row={index} {field} requires TOKEN:<detail>"}]
    return []


def _component_token(raw: str) -> str:
    return _token(raw.split()[0] if raw.strip() else "")


def semantic(row: dict[str, str], index: int) -> list[dict[str, str]]:
    errors = []
    errors.extend(validate_enum_or_na(row, "Framework", FRAMEWORKS, "FRONTEND_PREPLAN", index))
    errors.extend(validate_enum_or_na(row, "Layout", LAYOUT, "FRONTEND_PREPLAN", index))
    errors.extend(_require_detail(row.get("Layout", ""), _normalize_token(row.get("Layout", ""), LAYOUT_ALIAS), "Layout", index))
    errors.extend(validate_enum_or_na(row, "State Ownership", STATE, "FRONTEND_PREPLAN", index))
    errors.extend(
        _require_detail(
            row.get("State Ownership", ""),
            _normalize_token(row.get("State Ownership", ""), STATE_ALIAS),
            "State Ownership",
            index,
        )
    )
    errors.extend(validate_enum_or_na(row, "Responsive", RESPONSIVE, "FRONTEND_PREPLAN", index))
    errors.extend(
        _require_detail(
            row.get("Responsive", ""),
            _normalize_token(row.get("Responsive", ""), RESPONSIVE_ALIAS),
            "Responsive",
            index,
        )
    )
    errors.extend(validate_enum_or_na(row, "Visual Verification", VISUAL, "FRONTEND_PREPLAN", index))
    cmap = row.get("Component Map", "")
    ctok = _component_token(cmap)
    if ctok not in COMPONENT:
        if cmap.strip() and ctok not in {"", "N/A", "NA"}:
            errors.append({"code": "DOMAIN_SEMANTIC_TOKEN_INVALID", "detail": f"row={index} Component Map={cmap}"})
        else:
            errors.append({"code": "FRONTEND_PREPLAN_ENUM_INVALID", "detail": f"row={index} Component Map missing action token"})
    if ctok == "NEW":
        ds = row.get("Design System", "").strip()
        if not ds or ds.upper() in {"N/A", "NA", "-", "NONE"}:
            errors.append(
                {
                    "code": "FRONTEND_PREPLAN_CONDITIONAL_INVALID",
                    "detail": f"row={index} Design System required when Component Map includes NEW",
                }
            )
    return errors


def validate(p: Path):
    errors = validate_table(p, "Frontend Design Intent", list(REQ), "FRONTEND_PREPLAN")
    _, rows = parse_table(p, "Frontend Design Intent")
    if not rows and errors:
        text = p.read_text(encoding="utf-8")
        if "## Frontend Design Intent" in text:
            errors.append({"code": "DOMAIN_SEMANTIC_LEGACY_FULL_REQUIRED", "detail": "unstructured frontend intent"})
        return errors
    errors.extend(apply_row_rules(p, "Frontend Design Intent", "FRONTEND_PREPLAN", semantic))
    if _profile(p) == "LEAN":
        for index, row in enumerate(rows, 1):
            layout = _normalize_token(row.get("Layout", ""), LAYOUT_ALIAS)
            state = _normalize_token(row.get("State Ownership", ""), STATE_ALIAS)
            responsive = _normalize_token(row.get("Responsive", ""), RESPONSIVE_ALIAS)
            ds = row.get("Design System", "").strip().upper()
            new_primitive = "NEW" in ds or ds.startswith("NEW_")
            if (
                layout == "NEW_HIERARCHY"
                or state in {"NEW_OWNER", "MOVE_OWNER"}
                or responsive == "NEW_ARCHITECTURE"
                or new_primitive
            ):
                errors.append({"code": "FRONTEND_PREPLAN_FULL_REQUIRED", "detail": f"row={index} structured FULL trigger"})
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
