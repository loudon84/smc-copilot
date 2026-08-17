"""Minimal YAML subset loader (mappings, lists, scalars). No new package."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def load_yaml(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    value, _ = _parse_block(lines, 0, 0)
    if value is None:
        raise ValueError(f"empty yaml: {path}")
    return value


def _parse_block(lines: list[str], index: int, indent: int) -> tuple[Any, int]:
    while index < len(lines):
        raw = lines[index]
        if not raw.strip() or raw.lstrip().startswith("#"):
            index += 1
            continue
        current = _indent(raw)
        if current < indent:
            return None, index
        stripped = raw.strip()
        if stripped.startswith("- "):
            return _parse_list(lines, index, current)
        if ":" in stripped:
            return _parse_map(lines, index, current)
        return _parse_scalar(stripped), index + 1
    return None, index


def _parse_map(lines: list[str], index: int, indent: int) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {}
    while index < len(lines):
        raw = lines[index]
        if not raw.strip() or raw.lstrip().startswith("#"):
            index += 1
            continue
        current = _indent(raw)
        if current < indent:
            break
        if current > indent:
            raise ValueError(f"unexpected indent: {raw}")
        stripped = raw.strip()
        if stripped.startswith("- "):
            break
        if ":" not in stripped:
            raise ValueError(f"expected mapping: {raw}")
        key, rest = stripped.split(":", 1)
        key = key.strip()
        rest = rest.strip()
        index += 1
        if rest:
            result[key] = _parse_scalar(rest)
            continue
        value, index = _parse_block(lines, index, indent + 2)
        result[key] = {} if value is None else value
    return result, index


def _parse_list(lines: list[str], index: int, indent: int) -> tuple[list[Any], int]:
    result: list[Any] = []
    while index < len(lines):
        raw = lines[index]
        if not raw.strip() or raw.lstrip().startswith("#"):
            index += 1
            continue
        current = _indent(raw)
        if current < indent:
            break
        stripped = raw.strip()
        if not stripped.startswith("- "):
            break
        item = stripped[2:].strip()
        index += 1
        if not item:
            value, index = _parse_block(lines, index, indent + 2)
            result.append({} if value is None else value)
            continue
        if item.endswith(":") or (":" in item and not item.startswith(("'", '"'))):
            key, rest = item.split(":", 1)
            nested: dict[str, Any] = {key.strip(): _parse_scalar(rest.strip()) if rest.strip() else {}}
            child, index = _parse_map_continuation(lines, index, indent + 2, nested)
            result.append(child)
            continue
        result.append(_parse_scalar(item))
    return result, index


def _parse_map_continuation(
    lines: list[str], index: int, indent: int, seed: dict[str, Any]
) -> tuple[dict[str, Any], int]:
    extra, index = _parse_map(lines, index, indent)
    seed.update(extra)
    return seed, index


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _parse_scalar(text: str) -> Any:
    if text in ("", "~", "null"):
        return None
    if text in ("true", "True"):
        return True
    if text in ("false", "False"):
        return False
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        return text[1:-1]
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return text
