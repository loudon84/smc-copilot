"""Strict shared Markdown table contract for domain intent and quality ledgers."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable


def _cells(line: str) -> list[str]:
    return [v.strip().strip("`") for v in line.strip("|").split("|")]


def parse_table(path: Path, heading: str) -> tuple[list[str], list[dict[str, str]]]:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^##\s+" + re.escape(heading) + r"\s*$\n?(.*?)(?=^##\s+|\Z)", text, re.M | re.S)
    lines = [x.strip() for x in (m.group(1) if m else "").splitlines() if x.strip().startswith("|")]
    if len(lines) < 3:
        return [], []
    header = _cells(lines[0])
    rows = []
    for line in lines[2:]:
        values = _cells(line)
        if len(values) == len(header):
            rows.append(dict(zip(header, values)))
    return header, rows


def validate_table(path, heading, required, prefix):
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^##\s+" + re.escape(heading) + r"\s*$\n?(.*?)(?=^##\s+|\Z)", text, re.M | re.S)
    lines = [x.strip() for x in (m.group(1) if m else "").splitlines() if x.strip().startswith("|")]
    errors = []

    def err(code, detail):
        errors.append({"code": prefix + "_" + code, "detail": detail})

    if len(lines) < 3:
        err("ROWS_MISSING", heading)
        return errors
    header = _cells(lines[0])
    if len(set(header)) != len(header) or any(x not in header for x in required):
        err("COLUMNS_MISSING", str(required))
    separator = _cells(lines[1])
    if len(separator) != len(header) or not all(re.fullmatch(r":?-{3,}:?", x) for x in separator):
        err("SEPARATOR_INVALID", heading)
    ids = []
    for index, line in enumerate(lines[2:], 1):
        values = _cells(line)
        if len(values) != len(header):
            err("ROW_SHAPE_INVALID", str(index))
            continue
        row = dict(zip(header, values))
        ids.append(row.get("Change ID", ""))
        bad = [
            k
            for k in required
            if not row.get(k) or re.search(r"<[^>]+>|\bTBD\b|\?\?\?", row.get(k, ""), re.I)
        ]
        if bad:
            err("ROW_INCOMPLETE", f"row={index} fields={bad}")
    if len(ids) != len(set(ids)):
        err("DUPLICATE_CHANGE_ID", str(ids))
    return errors


def _token(value: str) -> str:
    return value.strip().strip("`").split(":", 1)[0].strip().upper()


def validate_enum(row: dict[str, str], field: str, allowed: set[str], prefix: str, index: int) -> list[dict[str, str]]:
    # @lat: [[acceptance-hardening#Domain Semantic Validation]]
    raw = row.get(field, "")
    token = _token(raw)
    if token not in {a.upper() for a in allowed}:
        return [{"code": f"{prefix}_ENUM_INVALID", "detail": f"row={index} {field}={raw}"}]
    return []


def validate_enum_or_na(
    row: dict[str, str], field: str, allowed: set[str], prefix: str, index: int
) -> list[dict[str, str]]:
    return validate_enum(row, field, set(allowed) | {"N/A", "NA"}, prefix, index)


def validate_required_if(
    row: dict[str, str],
    when_field: str,
    when_values: set[str],
    required_field: str,
    prefix: str,
    index: int,
) -> list[dict[str, str]]:
    if _token(row.get(when_field, "")) in {v.upper() for v in when_values}:
        val = row.get(required_field, "").strip()
        if not val or val.upper() in {"N/A", "NA", "-", "NONE"}:
            return [
                {
                    "code": f"{prefix}_CONDITIONAL_INVALID",
                    "detail": f"row={index} {required_field} required when {when_field} in {sorted(when_values)}",
                }
            ]
    return []


def validate_forbidden_if(
    row: dict[str, str],
    when_field: str,
    when_values: set[str],
    forbidden_field: str,
    forbidden_values: set[str],
    prefix: str,
    index: int,
) -> list[dict[str, str]]:
    if _token(row.get(when_field, "")) in {v.upper() for v in when_values}:
        if _token(row.get(forbidden_field, "")) in {v.upper() for v in forbidden_values}:
            return [
                {
                    "code": f"{prefix}_FORBIDDEN_COMBINATION",
                    "detail": f"row={index} {forbidden_field} forbidden when {when_field}",
                }
            ]
    return []


def validate_pair(
    row: dict[str, str],
    field_a: str,
    field_b: str,
    predicate: Callable[[str, str], bool],
    prefix: str,
    code: str,
    index: int,
) -> list[dict[str, str]]:
    a = row.get(field_a, "")
    b = row.get(field_b, "")
    if not predicate(a, b):
        return [{"code": f"{prefix}_{code}", "detail": f"row={index} {field_a}/{field_b}"}]
    return []


def validate_na_with_reason(
    row: dict[str, str], field: str, prefix: str, index: int, allow_bare_na: bool = False
) -> list[dict[str, str]]:
    raw = row.get(field, "").strip()
    token = _token(raw)
    if token in {"N/A", "NA"}:
        if allow_bare_na:
            return []
        if ":" not in raw and "(" not in raw:
            return [{"code": f"{prefix}_NA_REASON_REQUIRED", "detail": f"row={index} {field}"}]
    return []


def apply_row_rules(
    path: Path,
    heading: str,
    prefix: str,
    rules: Callable[[dict[str, str], int], list[dict[str, str]]],
) -> list[dict[str, str]]:
    _, rows = parse_table(path, heading)
    errors: list[dict[str, str]] = []
    for index, row in enumerate(rows, 1):
        errors.extend(rules(row, index))
    return errors
