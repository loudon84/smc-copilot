#!/usr/bin/env python3
"""Deterministic engineering-method runtime for SMC governed Todo execution.

This module is execution working-memory only. It does not add a Plan, Review,
Verification, Evidence or Delivery state machine. It classifies a Todo into an
engineering profile and records TDD/debugging method evidence under
.smc/runs/<plan-id>/engineering/.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from common import append_jsonl, atomic_write, find_repo_root, plan_id, read_jsonl, semantic_plan_sha256, utc_now

PROFILES = {"MECHANICAL", "BEHAVIOR_CHANGE", "BUG_FIX", "HIGH_RISK"}
TDD_POLICIES = {"TDD_REQUIRED", "TDD_PREFERRED", "TDD_NOT_APPLICABLE"}
DEBUG_POLICIES = {"REQUIRED", "ON_FAILURE"}
MODEL_TIERS = {"FAST", "STANDARD", "REASONING"}
REVIEW_DEPTHS = {"UNIFIED", "INDEPENDENT"}

HIGH_RISK_TOKENS = (
    "security", "secure", "auth", "authentication", "authorization", "permission",
    "credential", "secret", "encryption", "trust boundary", "trust-boundary",
    "concurrency", "concurrent", "race", "deadlock", "lock", "transaction",
    "migration", "schema", "protocol", "public api", "public contract",
    "cross-boundary", "cross boundary", "lifecycle", "idempot", "lease", "distributed",
)
BUG_TOKENS = (
    "bug", "fix", "regression", "failure", "failing", "error", "incorrect", "broken",
    "crash", "timeout", "unexpected", "defect",
)
MECHANICAL_TOKENS = (
    "config", "configuration", "constant", "rename", "metadata", "docs", "documentation",
    "comment", "generated", "version bump", "copy", "mirror", "typo",
)
BEHAVIOR_TOKENS = (
    "behavior", "behaviour", "feature", "implement", "add", "support", "validate", "validation",
    "retry", "state transition", "state machine", "calculate", "transform", "endpoint", "handler",
)
NO_TDD_TOKENS = (
    "docs", "documentation", "comment", "generated", "metadata", "configuration", "config",
    "version bump", "mirror", "typo",
)


def _norm_todo(todo: str) -> str:
    value = todo.strip().upper()
    if not re.fullmatch(r"T\d+", value):
        raise ValueError(f"ENGINEERING_TODO_INVALID: {todo}")
    return value


def run_dir(plan: Path) -> Path:
    return find_repo_root(plan) / ".smc" / "runs" / plan_id(plan)


def engineering_dir(plan: Path) -> Path:
    return run_dir(plan) / "engineering"


def method_path(plan: Path, todo: str) -> Path:
    return engineering_dir(plan) / f"{_norm_todo(todo)}-method.json"


def tdd_path(plan: Path, todo: str) -> Path:
    return engineering_dir(plan) / f"{_norm_todo(todo)}-tdd.jsonl"


def debug_path(plan: Path, todo: str) -> Path:
    return engineering_dir(plan) / f"{_norm_todo(todo)}-debug.jsonl"


def _todo_slice(plan: Path, todo: str) -> tuple[str, str]:
    tid = _norm_todo(todo)
    text = plan.read_text(encoding="utf-8")
    matches = list(re.finditer(r"^##\s+Todo\s+(T\d+)\b(.*)$", text, re.M | re.I))
    for index, match in enumerate(matches):
        if match.group(1).upper() != tid:
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        suffix = re.sub(r"^[\s—:\-]+", "", match.group(2)).strip()
        return suffix, text[start:end].strip()
    raise ValueError(f"ENGINEERING_TODO_NOT_FOUND: {tid}")


def _contains(text: str, tokens: tuple[str, ...]) -> list[str]:
    lower = text.lower()
    found: set[str] = set()
    for token in tokens:
        if re.fullmatch(r"[a-z0-9_]+", token):
            if re.search(rf"(?<![a-z0-9_]){re.escape(token)}(?![a-z0-9_])", lower):
                found.add(token)
        elif token in lower:
            found.add(token)
    return sorted(found)


# @lat: [[runtime-cost#GES Runtime Cost Optimization#Engineering Method Runtime]]
def classify(
    plan: Path,
    todo: str,
    *,
    profile_override: str = "AUTO",
    tdd_override: str = "AUTO",
    debug_override: str = "AUTO",
    model_override: str = "AUTO",
    review_override: str = "AUTO",
    write: bool = True,
) -> dict:
    tid = _norm_todo(todo)
    title, body = _todo_slice(plan, tid)
    source_text = f"{title}\n{body}"
    high = _contains(source_text, HIGH_RISK_TOKENS)
    bugs = _contains(source_text, BUG_TOKENS)
    mechanical = _contains(source_text, MECHANICAL_TOKENS)
    behavior = _contains(source_text, BEHAVIOR_TOKENS)
    no_tdd = _contains(source_text, NO_TDD_TOKENS)

    override = profile_override.upper()
    if override != "AUTO" and override not in PROFILES:
        raise ValueError(f"ENGINEERING_PROFILE_INVALID: {profile_override}")
    if override != "AUTO":
        profile = override
        reason = "explicit controller override"
        source = "override"
    elif high:
        profile = "HIGH_RISK"
        reason = "high-risk semantic signal"
        source = "heuristic"
    elif bugs:
        profile = "BUG_FIX"
        reason = "bug/failure semantic signal"
        source = "heuristic"
    elif mechanical:
        profile = "MECHANICAL"
        reason = "mechanical/configuration semantic signal"
        source = "heuristic"
    elif behavior:
        profile = "BEHAVIOR_CHANGE"
        reason = "observable-behavior semantic signal"
        source = "heuristic"
    else:
        profile = "BEHAVIOR_CHANGE"
        reason = "ambiguous implementation defaults to behavior profile with preferred TDD"
        source = "heuristic"

    if profile == "MECHANICAL":
        tdd = "TDD_NOT_APPLICABLE" if no_tdd else "TDD_PREFERRED"
        debug = "ON_FAILURE"
        model = "FAST"
        review = "UNIFIED"
    elif profile == "BUG_FIX":
        tdd = "TDD_REQUIRED"
        debug = "REQUIRED"
        model = "STANDARD"
        review = "UNIFIED"
    elif profile == "HIGH_RISK":
        tdd = "TDD_REQUIRED"
        debug = "REQUIRED" if bugs else "ON_FAILURE"
        model = "REASONING"
        review = "INDEPENDENT"
    else:
        tdd = "TDD_REQUIRED" if behavior or override == "BEHAVIOR_CHANGE" else "TDD_PREFERRED"
        debug = "ON_FAILURE"
        model = "STANDARD"
        review = "UNIFIED"

    def choose(value: str, allowed: set[str], current: str, label: str) -> str:
        value = value.upper()
        if value == "AUTO":
            return current
        if value not in allowed:
            raise ValueError(f"{label}_INVALID: {value}")
        return value

    tdd = choose(tdd_override, TDD_POLICIES, tdd, "TDD_POLICY")
    debug = choose(debug_override, DEBUG_POLICIES, debug, "DEBUG_POLICY")
    model = choose(model_override, MODEL_TIERS, model, "MODEL_TIER")
    review = choose(review_override, REVIEW_DEPTHS, review, "REVIEW_DEPTH")

    result = {
        "schema": "smc.execution.engineering-method.v1",
        "plan_id": plan_id(plan),
        "plan_semantic_sha256": semantic_plan_sha256(plan),
        "todo": tid,
        "profile": profile,
        "tdd_policy": tdd,
        "debugging_policy": debug,
        "model_tier": model,
        "review_depth": review,
        "classification_source": source,
        "reason": reason,
        "signals": {
            "high_risk": high,
            "bug": bugs,
            "mechanical": mechanical,
            "behavior": behavior,
            "no_tdd": no_tdd,
        },
        "title": title,
        "updated_at": utc_now(),
        "working_memory_only": True,
    }
    if write:
        atomic_write(method_path(plan, tid), json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    return result


def load_method(plan: Path, todo: str) -> dict:
    path = method_path(plan, todo)
    if path.is_file():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"ENGINEERING_METHOD_INVALID: {path}") from exc
        if not isinstance(value, dict) or value.get("schema") != "smc.execution.engineering-method.v1":
            raise ValueError(f"ENGINEERING_METHOD_INVALID: {path}")
        if value.get("plan_id") != plan_id(plan):
            raise ValueError(f"ENGINEERING_METHOD_PLAN_ID_MISMATCH: {path}")
        if value.get("plan_semantic_sha256") != semantic_plan_sha256(plan):
            raise ValueError(f"ENGINEERING_METHOD_PLAN_STALE: {path}; rerun classify")
        return value
    return classify(plan, todo)


def tdd_event(plan: Path, todo: str, phase: str, status: str, command: str, note: str) -> dict:
    tid = _norm_todo(todo)
    phase = phase.upper()
    status = status.upper()
    if phase not in {"RED", "GREEN", "REFACTOR"}:
        raise ValueError(f"TDD_PHASE_INVALID: {phase}")
    allowed = {
        "RED": {"CONFIRMED", "FAIL", "SKIPPED"},
        "GREEN": {"PASS", "FAIL", "SKIPPED"},
        "REFACTOR": {"PASS", "FAIL", "SKIPPED"},
    }[phase]
    if status not in allowed:
        raise ValueError(f"TDD_STATUS_INVALID: {phase}={status}")
    rec = {
        "schema": "smc.execution.tdd-event.v1",
        "at": utc_now(),
        "plan_id": plan_id(plan),
        "todo": tid,
        "phase": phase,
        "status": status,
        "command": command.strip(),
        "note": re.sub(r"\s+", " ", note.strip())[:1000],
        "working_memory_only": True,
        "final_verification": False,
    }
    append_jsonl(tdd_path(plan, tid), rec)
    return rec


def tdd_check(plan: Path, todo: str) -> tuple[int, dict]:
    tid = _norm_todo(todo)
    method = load_method(plan, tid)
    policy = str(method.get("tdd_policy"))
    rows = read_jsonl(tdd_path(plan, tid))
    if policy == "TDD_NOT_APPLICABLE":
        return 0, {"status": "PASS", "reason": "TDD_NOT_APPLICABLE", "todo": tid, "policy": policy}
    if policy == "TDD_PREFERRED" and not rows:
        return 0, {"status": "PASS", "reason": "TDD_PREFERRED_NOT_USED", "todo": tid, "policy": policy}

    red_indexes = [i for i, row in enumerate(rows) if row.get("phase") == "RED" and row.get("status") == "CONFIRMED"]
    green_indexes = [i for i, row in enumerate(rows) if row.get("phase") == "GREEN" and row.get("status") == "PASS"]
    if not red_indexes:
        return 2, {"status": "BLOCKED", "reason": "TDD_RED_NOT_CONFIRMED", "todo": tid, "policy": policy}
    if not green_indexes:
        return 2, {"status": "BLOCKED", "reason": "TDD_GREEN_NOT_PASS", "todo": tid, "policy": policy}
    if min(green_indexes) < min(red_indexes):
        return 2, {"status": "BLOCKED", "reason": "TDD_GREEN_PRECEDES_RED", "todo": tid, "policy": policy}
    refactor_fail = any(row.get("phase") == "REFACTOR" and row.get("status") == "FAIL" for row in rows)
    if refactor_fail:
        return 2, {"status": "BLOCKED", "reason": "TDD_REFACTOR_FAIL", "todo": tid, "policy": policy}
    return 0, {"status": "PASS", "reason": "TDD_CYCLE_CONFIRMED", "todo": tid, "policy": policy}


def debug_event(plan: Path, todo: str, phase: str, status: str, summary: str) -> dict:
    tid = _norm_todo(todo)
    phase = phase.upper()
    status = status.upper()
    if phase not in {"ROOT_CAUSE", "PATTERN", "HYPOTHESIS", "FIX_ATTEMPT", "VERIFIED"}:
        raise ValueError(f"DEBUG_PHASE_INVALID: {phase}")
    if status not in {"INFO", "CONFIRMED", "REJECTED", "PASS", "FAIL"}:
        raise ValueError(f"DEBUG_STATUS_INVALID: {status}")
    rec = {
        "schema": "smc.execution.debug-event.v1",
        "at": utc_now(),
        "plan_id": plan_id(plan),
        "todo": tid,
        "phase": phase,
        "status": status,
        "summary": re.sub(r"\s+", " ", summary.strip())[:1200],
        "working_memory_only": True,
        "final_verification": False,
    }
    append_jsonl(debug_path(plan, tid), rec)
    return rec


def debug_check(plan: Path, todo: str) -> tuple[int, dict]:
    tid = _norm_todo(todo)
    method = load_method(plan, tid)
    policy = str(method.get("debugging_policy"))
    rows = read_jsonl(debug_path(plan, tid))
    failed_fixes = sum(1 for row in rows if row.get("phase") == "FIX_ATTEMPT" and row.get("status") == "FAIL")
    if failed_fixes >= 3:
        return 3, {
            "status": "ESCALATE",
            "reason": "DEBUG_ARCHITECTURE_ESCALATION",
            "todo": tid,
            "failed_fix_attempts": failed_fixes,
        }
    if policy == "ON_FAILURE" and not rows:
        return 0, {"status": "PASS", "reason": "DEBUG_NOT_TRIGGERED", "todo": tid, "policy": policy}

    root_indexes = [i for i, row in enumerate(rows) if row.get("phase") == "ROOT_CAUSE" and row.get("status") == "CONFIRMED"]
    if not root_indexes:
        return 2, {"status": "BLOCKED", "reason": "DEBUG_ROOT_CAUSE_REQUIRED", "todo": tid, "policy": policy}
    fix_indexes = [i for i, row in enumerate(rows) if row.get("phase") == "FIX_ATTEMPT"]
    if fix_indexes and min(fix_indexes) < min(root_indexes):
        return 2, {"status": "BLOCKED", "reason": "DEBUG_FIX_BEFORE_ROOT_CAUSE", "todo": tid, "policy": policy}
    return 0, {
        "status": "PASS",
        "reason": "DEBUG_ROOT_CAUSE_CONFIRMED",
        "todo": tid,
        "policy": policy,
        "failed_fix_attempts": failed_fixes,
    }


def _print(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("classify")
    p.add_argument("plan", type=Path); p.add_argument("--todo", required=True)
    p.add_argument("--profile", default="AUTO")
    p.add_argument("--tdd", default="AUTO")
    p.add_argument("--debug", default="AUTO")
    p.add_argument("--model", default="AUTO")
    p.add_argument("--review", default="AUTO")
    p.add_argument("--no-write", action="store_true")

    p = sub.add_parser("tdd-event")
    p.add_argument("plan", type=Path); p.add_argument("--todo", required=True)
    p.add_argument("--phase", required=True); p.add_argument("--status", required=True)
    p.add_argument("--command", default=""); p.add_argument("--note", default="")

    p = sub.add_parser("tdd-check")
    p.add_argument("plan", type=Path); p.add_argument("--todo", required=True)

    p = sub.add_parser("debug-event")
    p.add_argument("plan", type=Path); p.add_argument("--todo", required=True)
    p.add_argument("--phase", required=True); p.add_argument("--status", required=True)
    p.add_argument("--summary", default="")

    p = sub.add_parser("debug-check")
    p.add_argument("plan", type=Path); p.add_argument("--todo", required=True)

    args = ap.parse_args()
    plan = args.plan.resolve()
    if not plan.is_file():
        print(f"PLAN_NOT_FOUND: {plan}", file=sys.stderr)
        return 2
    try:
        if args.cmd == "classify":
            payload = classify(
                plan,
                args.todo,
                profile_override=args.profile,
                tdd_override=args.tdd,
                debug_override=args.debug,
                model_override=args.model,
                review_override=args.review,
                write=not args.no_write,
            )
            code = 0
        elif args.cmd == "tdd-event":
            payload = tdd_event(plan, args.todo, args.phase, args.status, args.command, args.note)
            code = 0
        elif args.cmd == "tdd-check":
            code, payload = tdd_check(plan, args.todo)
        elif args.cmd == "debug-event":
            payload = debug_event(plan, args.todo, args.phase, args.status, args.summary)
            code = 0
        else:
            code, payload = debug_check(plan, args.todo)
    except (ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    _print(payload)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
