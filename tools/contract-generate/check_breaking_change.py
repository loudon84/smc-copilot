#!/usr/bin/env python3
"""Lightweight OpenAPI breaking-change check against git HEAD version of openapi.yaml."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OPENAPI = ROOT / "contracts" / "runtime-api" / "openapi.yaml"


def _load_yaml(text: str) -> dict:
    data = yaml.safe_load(text) or {}
    if not isinstance(data, dict):
        raise ValueError("openapi root must be an object")
    return data


def _ops(doc: dict) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for path, item in (doc.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        for method in item:
            if method.startswith("x-"):
                continue
            out.add((method.lower(), path))
    return out


def main() -> int:
    if not OPENAPI.exists():
        print("openapi.yaml missing; run contracts:generate first", file=sys.stderr)
        return 1

    current = _load_yaml(OPENAPI.read_text(encoding="utf-8"))
    try:
        prev_text = subprocess.check_output(
            ["git", "show", f"HEAD:{OPENAPI.relative_to(ROOT).as_posix()}"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        print("[breaking_change_check] no previous openapi in HEAD — skip")
        return 0

    previous = _load_yaml(prev_text)
    removed = _ops(previous) - _ops(current)
    if removed:
        print("BREAKING: removed endpoints:", file=sys.stderr)
        for method, path in sorted(removed):
            print(f"  {method.upper()} {path}", file=sys.stderr)
        print("Bump contracts/version.json major and add ADR.", file=sys.stderr)
        return 1

    print("[breaking_change_check] no removed endpoints")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
