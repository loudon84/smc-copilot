"""Product release catalog membership (opsi-control)."""

from __future__ import annotations

import re
from typing import Any

COMPAT_RE = re.compile(r"^(>=|<=|>|<|=)?\d+$")
SMOKE_EVIDENCE_PREFIXES = ("test://", "smoke://", "fixture://", "fake://")


def parse_compat(expr: str) -> tuple[str, int]:
    text = str(expr or "").strip()
    if not COMPAT_RE.match(text):
        raise ValueError(f"invalid controllerCompat: {expr}")
    if text.startswith(">=") or text.startswith("<="):
        return text[:2], int(text[2:])
    if text[0] in "><=":
        return text[0], int(text[1:])
    return "=", int(text)


def compat_holds(expr: str, controller_revision: str) -> bool:
    op, bound = parse_compat(expr)
    actual = int(str(controller_revision).strip())
    if op == ">=":
        return actual >= bound
    if op == "<=":
        return actual <= bound
    if op == ">":
        return actual > bound
    if op == "<":
        return actual < bound
    return actual == bound


def runtime_in_catalog(release: dict[str, Any], hermes_version: str) -> bool:
    return any(str(item.get("version")) == hermes_version for item in release.get("runtimes") or [])


def smoke_evidence_ref(evidence_ref: str) -> bool:
    return evidence_ref.lower().startswith(SMOKE_EVIDENCE_PREFIXES)
