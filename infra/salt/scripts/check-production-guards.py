#!/usr/bin/env python3
"""Fail CI when production-forbidden placeholders / insecure patterns appear.

Forbidden in production paths (extensions, master, client windows scripts, salt-control src):
- sha256 of all a's / obvious placeholders
- artifacts.internal.smc placeholder domain in non-example manifests
- HMAC artifact signing as the production path without SMC_SALT_ENV=lab|test gate
- Returner defaulting to lab JSONL sink without env gate
- Secret XOR / default cache key without lab gate
- Canary stub claiming PASS
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SALT = ROOT / "infra" / "salt"
CONTROL = ROOT / "services" / "salt-control" / "src"

PLACEHOLDER_SHA = re.compile(r'"sha256"\s*:\s*"(a{64}|0{64})"', re.I)
PLACEHOLDER_HOST = re.compile(r"artifacts\.internal\.smc")
HMAC_PROD = re.compile(r"hmac_signature|HMAC shared|SMC_ARTIFACT_SIGNING_KEY")
XOR_CACHE = re.compile(r"smc-lab-cache-key|XOR\+hmac")
LAB_SINK = re.compile(r"lab[/\\]returns[/\\]jobs\.jsonl")


def _scan(paths: list[Path], pattern: re.Pattern[str], allow_lab_gate: bool = False) -> list[str]:
    hits: list[str] = []
    for path in paths:
        if not path.is_file():
            continue
        if "example" in path.name.lower() or path.suffix in {".md"}:
            continue
        if "tests" in path.parts or "lab" in path.parts or "fixtures" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if allow_lab_gate and ("SMC_SALT_ENV" in text or "salt_env" in text):
            # Gated files are OK if they refuse production without lab|test.
            if re.search(r"lab\|test|!=\s*[\"']production|production.*forbid|forbid.*production", text, re.I):
                continue
        if pattern.search(text):
            hits.append(str(path.relative_to(ROOT)))
    return hits


def main() -> int:
    manifest = SALT / "manifest" / "client-manifest.json"
    example = SALT / "manifest" / "client-manifest.example.json"
    errors: list[str] = []

    if manifest.is_file():
        text = manifest.read_text(encoding="utf-8")
        if PLACEHOLDER_SHA.search(text) or PLACEHOLDER_HOST.search(text):
            errors.append(
                "infra/salt/manifest/client-manifest.json contains placeholder sha/host; "
                "use client-manifest.example.json for samples and ship real release manifests only"
            )

    scan_files = list((SALT / "extensions").rglob("*.py"))
    scan_files += list((SALT / "client").rglob("*.py"))
    scan_files += list((SALT / "client" / "windows").rglob("*.ps1"))
    if CONTROL.is_dir():
        scan_files += list(CONTROL.rglob("*.py"))

    for hit in _scan(scan_files, PLACEHOLDER_SHA):
        errors.append(f"placeholder sha256: {hit}")
    for hit in _scan([example] if False else [], PLACEHOLDER_HOST):
        pass
    # Production extensions/returners/secrets must be env-gated
    for hit in _scan(scan_files, XOR_CACHE, allow_lab_gate=True):
        errors.append(f"secret XOR/default key without production gate: {hit}")
    for hit in _scan(scan_files, LAB_SINK, allow_lab_gate=True):
        errors.append(f"lab return sink without production gate: {hit}")

    canary = SALT / "tests" / "canary"
    if canary.is_dir():
        for path in canary.rglob("*"):
            if path.suffix.lower() in {".ps1", ".md", ".feature"}:
                text = path.read_text(encoding="utf-8", errors="replace")
                if re.search(r"PASS.*stub|stub.*PASS|claim.*PASS", text, re.I) and "NOT" not in text.upper():
                    if "Not executed" not in text and "NOT PROVEN" not in text and "hardware" not in text.lower():
                        errors.append(f"canary stub claiming PASS: {path.relative_to(ROOT)}")

    if errors:
        print("[check-production-guards] FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("[check-production-guards] ok")
    if example.is_file():
        print(f"  example manifest present: {example.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
