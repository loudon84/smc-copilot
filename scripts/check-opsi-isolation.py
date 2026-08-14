#!/usr/bin/env python3
"""OPSI isolation guard: no Salt/Runtime implementation coupling."""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPSI_SRC = ROOT / "services" / "opsi-control" / "src"
FORBIDDEN_IMPORT = re.compile(r"^\s*(from|import)\s+(salt_control|services\.runtime|services\.salt_control)\b", re.M)
SALT_PATHS = ("infra/salt", "services/salt-control", "contracts/salt-control-api")
RUNTIME_PATHS = ("services/runtime", "contracts/runtime-api")
ZERO_SHA = "0" * 40


def scan_imports() -> list[str]:
    hits: list[str] = []
    if not OPSI_SRC.is_dir():
        return ["missing services/opsi-control/src"]
    for path in OPSI_SRC.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if FORBIDDEN_IMPORT.search(text) or "from services.runtime" in text or "from services.salt" in text:
            hits.append(str(path.relative_to(ROOT)))
    return hits


def resolve_base(raw: str) -> str:
    value = (raw or "").strip()
    if not value or value in {"HEAD", ZERO_SHA, "0" * 64}:
        raise SystemExit("[check-opsi-isolation] FAILED: merge base missing (fail closed)")
    result = subprocess.run(["git", "rev-parse", "--verify", value], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"[check-opsi-isolation] FAILED: unresolvable merge base {value!r}")
    return result.stdout.strip()


def diff_against(base: str, paths: tuple[str, ...]) -> str:
    cmd = ["git", "diff", "--exit-code", f"{base}...HEAD", "--", *paths]
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return result.stdout + result.stderr if result.returncode != 0 else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="", help="git base ref for PR isolation diff")
    args = parser.parse_args()
    errors: list[str] = []
    for hit in scan_imports():
        errors.append(f"forbidden import: {hit}")
    if not args.base:
        errors.append("merge base required (fail closed)")
    else:
        try:
            base = resolve_base(args.base)
        except SystemExit as exc:
            print(str(exc))
            return 1
        salt_diff = diff_against(base, SALT_PATHS)
        if salt_diff.strip():
            errors.append("OPSI change must not modify Salt implementation paths")
        runtime_diff = diff_against(base, RUNTIME_PATHS)
        if runtime_diff.strip():
            errors.append("OPSI change must not modify frozen Runtime Endpoint contracts")
    if errors:
        print("[check-opsi-isolation] FAILED")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("[check-opsi-isolation] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
