"""Stage-aware context budget decisions (smc.ges.context-budget.v1).

Extends qualitative token_budget.budget_for() with versioned numeric phase
limits. Never creates a parallel top-level context-budget product root.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
POLICY_PATH = HERE / "policies" / "context-budget.v1.json"
SCHEMA = "smc.ges.context-budget.v1"
PHASE_NAMES = (
    "routing",
    "grounding",
    "planning",
    "implementation",
    "review",
    "final_verification",
)


def _utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_policy(path: Path | None = None) -> dict[str, Any]:
    target = path or POLICY_PATH
    data = json.loads(target.read_text(encoding="utf-8"))
    if data.get("schema") != "smc.ges.context-budget-policy.v1":
        raise ValueError("CONTEXT_BUDGET_POLICY_INVALID")
    return data


def policy_digest(policy: dict[str, Any] | None = None) -> str:
    payload = policy or load_policy()
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def _phases_for(profile: str, policy: dict[str, Any]) -> list[dict[str, Any]]:
    key = (profile or "LEAN").strip().upper()
    profiles = policy.get("profiles") or {}
    block = profiles.get(key) or profiles.get("LEAN") or {}
    phases = list(block.get("phases") or [])
    if not phases:
        raise ValueError("CONTEXT_BUDGET_POLICY_EMPTY")
    return phases


# @lat: [[adaptive-governance-context-v508#上下文预算与缓存]]
def decide_budget(
    *,
    work_item_id: str,
    repo_identity: str | None,
    governance_profile: str,
    work_route_digest: str | None = None,
    feature_scope_digest: str | None = None,
    candidates: list[dict[str, Any]] | None = None,
    force_profile: str | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a context-budget.v1 decision; escalate LEAN→FULL then block if still over."""
    if not work_item_id or not str(work_item_id).strip():
        raise ValueError("WORK_ITEM_ID_REQUIRED")
    pol = policy or load_policy()
    profile = (force_profile or governance_profile or "LEAN").strip().upper()
    if profile not in {"NONE", "LEAN", "FULL"}:
        raise ValueError("GOVERNANCE_PROFILE_INVALID")

    candidates = list(candidates or [])
    digest = policy_digest(pol)
    version = str(pol.get("policy_version") or "1.0.0")
    upgrades: list[str] = []
    block_reason: str | None = None

    def build(prof: str) -> dict[str, Any]:
        phases = []
        for phase in _phases_for(prof, pol):
            name = str(phase.get("name") or "")
            phases.append(
                {
                    "name": name,
                    "max_files": int(phase["max_files"]),
                    "max_source_capsules": int(phase["max_source_capsules"]),
                    "max_context_tokens": int(phase["max_context_tokens"]),
                    "max_model_tier": phase.get("max_model_tier") or "STANDARD",
                    "independent_review": bool(phase.get("independent_review")),
                }
            )
        return {
            "schema": SCHEMA,
            "work_item_id": str(work_item_id).strip(),
            "repo_identity": repo_identity,
            "governance_profile": prof,
            "work_route_digest": work_route_digest,
            "feature_scope_digest": feature_scope_digest,
            "policy_version": version,
            "policy_digest": digest,
            "phases": phases,
            "generated_at": _utc(),
            "upgrades": list(upgrades),
            "status": "OK",
        }

    decision = build(profile)
    over = _over_budget(decision, candidates)
    if over and profile == "LEAN":
        upgrades.append("LEAN_TO_FULL")
        profile = "FULL"
        decision = build(profile)
        over = _over_budget(decision, candidates)
    if over:
        block_reason = "CONTEXT_BUDGET_INSUFFICIENT"
        decision["status"] = "BLOCKED"
        decision["error"] = block_reason
        decision["over_phases"] = over
    decision["candidate_count"] = len(candidates)
    decision["upgrades"] = list(upgrades)
    return decision


def _over_budget(decision: dict[str, Any], candidates: list[dict[str, Any]]) -> list[str]:
    """Return phase names whose limits cannot hold the candidate set."""
    if not candidates:
        return []
    files = len({str(c.get("path") or c.get("identity") or i) for i, c in enumerate(candidates)})
    capsules = len(candidates)
    tokens = sum(int(c.get("tokens") or c.get("approx_tokens") or 0) for c in candidates)
    # If no token hints, estimate 200 tokens per capsule for enforcement smoke.
    if tokens <= 0:
        tokens = capsules * 200
    over: list[str] = []
    for phase in decision.get("phases") or []:
        if files > int(phase["max_files"]) or capsules > int(phase["max_source_capsules"]) or tokens > int(
            phase["max_context_tokens"]
        ):
            over.append(str(phase["name"]))
    return over


def trim_candidates(
    candidates: list[dict[str, Any]],
    *,
    allowed_roots: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Drop out-of-scope / duplicate candidates before escalation."""
    allowed = [r.replace("\\", "/").rstrip("/") for r in (allowed_roots or []) if r]
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for c in candidates:
        path = str(c.get("path") or c.get("identity") or "").replace("\\", "/")
        if not path:
            continue
        if allowed and not any(path == r or path.startswith(r + "/") for r in allowed):
            continue
        key = path + "|" + str(c.get("content_sha256") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out
