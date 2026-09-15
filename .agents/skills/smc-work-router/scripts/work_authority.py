#!/usr/bin/env python3
"""Legacy work-authority.v1 shim — prefer work_facts.smc.ges.work-facts.v1.

Kept as a read-only compatibility layer for one release. Trust decisions converge
on work_facts.verify_envelope / route_bound.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

SCHEMA = "smc.ges.work-authority.v1"
AUTHORITY_FACTS = (
    "governed",
    "retained_production_change",
    "production_write_requested",
    "durable_product_artifact_requested",
)


def _sha_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _sha_payload(value: dict[str, Any]) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def authority_path(repo: Path, work_item_id: str) -> Path:
    return repo / ".smc" / "work" / work_item_id / "work-authority.json"


def load_authority(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("WORK_AUTHORITY_INVALID") from exc
    if data.get("schema") != SCHEMA:
        raise ValueError("WORK_AUTHORITY_INVALID")
    return data


def verify_authority(data: dict[str, Any], repo: Path | None = None) -> tuple[str, list[str]]:
    """Return (VERIFIED|MISSING|STALE|CONFLICT, reasons). Compat shim."""
    reasons: list[str] = []
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        return "MISSING", ["WORK_AUTHORITY_MISSING"]
    facts = data.get("facts")
    if not isinstance(facts, dict):
        return "INVALID", ["WORK_AUTHORITY_INVALID"]
    for key in AUTHORITY_FACTS:
        if key not in facts or facts[key] not in (True, False):
            reasons.append(f"WORK_AUTHORITY_INVALID:{key}")
    if reasons:
        return "INVALID", reasons
    body = {k: data[k] for k in ("schema", "work_item_id", "repo_head", "facts", "sources") if k in data}
    expected = _sha_payload(body)
    if data.get("authority_sha256") != expected:
        return "STALE", ["WORK_AUTHORITY_STALE"]
    if repo is not None:
        for src in sources:
            if not isinstance(src, dict):
                return "INVALID", ["WORK_AUTHORITY_INVALID"]
            rel = src.get("path")
            if not rel:
                continue
            path = repo / str(rel)
            if not path.is_file():
                return "STALE", ["WORK_AUTHORITY_STALE:source_missing"]
            if src.get("sha256") and src.get("sha256") != _sha_file(path):
                return "STALE", ["WORK_AUTHORITY_STALE:source_digest"]
    return "VERIFIED", []


def build_authority(
    work_item_id: str,
    facts: dict[str, Any],
    sources: list[dict[str, Any]],
    repo_head: str = "",
    generated_at: str = "",
) -> dict[str, Any]:
    # @lat: [[acceptance-closure#Canonical Digests]]
    # @lat: [[acceptance-closure#Work Authority Binding]]
    normalized = {k: bool(facts[k]) if k in facts and facts[k] in (True, False) else facts.get(k) for k in AUTHORITY_FACTS}
    for k in AUTHORITY_FACTS:
        if normalized.get(k) not in (True, False):
            normalized[k] = None  # UNKNOWN — must not default false
    body = {
        "schema": SCHEMA,
        "work_item_id": work_item_id,
        "repo_head": repo_head,
        "facts": {k: normalized[k] for k in AUTHORITY_FACTS},
        "sources": sources,
    }
    out = dict(body)
    if generated_at:
        out["generated_at"] = generated_at
    out["authority_sha256"] = _sha_payload(body)
    return out


def merge_route_facts(caller_facts: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    """Authority facts win; worker cannot override them."""
    merged = dict(caller_facts)
    for key in AUTHORITY_FACTS:
        if key in authority.get("facts", {}):
            merged[key] = authority["facts"][key]
    return merged


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("verify")
    p.add_argument("path", type=Path)
    p.add_argument("--repo", type=Path)
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("build")
    p.add_argument("--work-item-id", required=True)
    p.add_argument("--facts", type=Path, required=True)
    p.add_argument("--sources", type=Path, required=True)
    p.add_argument("--repo-head", default="")
    p.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    if a.cmd == "verify":
        data = load_authority(a.path)
        status, reasons = verify_authority(data, a.repo)
        out = {"status": status, "reasons": reasons, "authority_sha256": data.get("authority_sha256")}
        print(json.dumps(out, indent=2) if a.json else status)
        return 0 if status == "VERIFIED" else 1
    facts = json.loads(a.facts.read_text(encoding="utf-8"))
    sources = json.loads(a.sources.read_text(encoding="utf-8"))
    auth = build_authority(a.work_item_id, facts, sources, a.repo_head)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(auth, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
