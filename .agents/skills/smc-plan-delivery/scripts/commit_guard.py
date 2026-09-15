#!/usr/bin/env python3
"""Commit guard with CHECKPOINT / CANDIDATE / FINAL kinds (v5.0.6)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import atomic_write, find_repo_root, git, plan_id, repo_relative_path, utc_now
from evidence import default_manifest_path
from validate_delivery_completion import validate
from workspace import dirty_paths, inspect as workspace_inspect

SCHEMA = "smc.commit.guard.v3"
SCHEMA_LEGACY = "smc.commit.guard.v2"
COMMIT_KINDS = frozenset({"CHECKPOINT", "CANDIDATE", "FINAL"})


def guard_path(root: Path, pid: str) -> Path:
    return root / ".smc" / "runs" / f"{pid}-commit-guard.json"


def _incomplete_todos(plan: Path) -> list[str]:
    from plan_state import cursor_todos, smc_todo_id

    todos = cursor_todos(plan.read_text(encoding="utf-8"))
    out = []
    for item in todos:
        tid = smc_todo_id(str(item["id"]))
        if tid and item.get("status") != "completed":
            out.append(f"{tid}={item.get('status')}")
    return out


def capture(plan: Path, commit_kind: str = "FINAL") -> int:
    # @lat: [[plan-delivery#post_review Commit]]
    # @lat: [[frontend-context#Commit Guard v3]]
    kind = (commit_kind or "FINAL").upper()
    if kind not in COMMIT_KINDS:
        print(f"COMMIT_KIND_INVALID: {kind}", file=sys.stderr)
        return 2

    root = find_repo_root(plan)
    incomplete = _incomplete_todos(plan)

    if kind == "FINAL":
        if incomplete:
            print("FINAL_COMMIT_BLOCKED_PENDING_TODO: " + ", ".join(incomplete), file=sys.stderr)
            return 1
        errors, details = validate(plan)
        if errors:
            print("\n".join(errors), file=sys.stderr)
            return 1
    elif kind == "CANDIDATE":
        # Candidate may have incomplete non-blocking work but still needs workspace inspect.
        errors, details = validate(plan) if not incomplete else ([], {
            "plan_id": plan_id(plan),
            "scope_fingerprint": None,
            "ambient_fingerprint": None,
        })
        if incomplete and not details.get("scope_fingerprint"):
            ws0 = workspace_inspect(plan)
            details = {
                "plan_id": plan_id(plan),
                "scope_fingerprint": ws0["scope_fingerprint"],
                "ambient_fingerprint": ws0["ambient_fingerprint"],
            }
        elif errors and not incomplete:
            print("\n".join(errors), file=sys.stderr)
            return 1
    else:
        # CHECKPOINT: allow pending todos; delivery_complete=false
        ws0 = workspace_inspect(plan)
        details = {
            "plan_id": plan_id(plan),
            "scope_fingerprint": ws0["scope_fingerprint"],
            "ambient_fingerprint": ws0["ambient_fingerprint"],
        }

    ws = workspace_inspect(plan)
    if not ws["pass"] and kind == "FINAL":
        print("COMMIT_GUARD_WORKSPACE_UNSTABLE", file=sys.stderr)
        return 1

    manifest = repo_relative_path(default_manifest_path(root, plan_id(plan)), root)
    current_dirty = dirty_paths(root)
    allowed = set(ws["scope_changed_files"]) | {ws["plan"], manifest}
    required = set(ws["scope_changed_files"]) | {manifest}
    if ws["plan"] in current_dirty:
        required.add(ws["plan"])
    if kind == "CHECKPOINT":
        required = set()  # checkpoint does not require full delivery set

    rec = {
        "schema": SCHEMA,
        "plan_id": plan_id(plan),
        "commit_kind": kind,
        "delivery_complete": kind == "FINAL" and not incomplete,
        "pending_todos": incomplete,
        "ready_scope_fingerprint": details.get("scope_fingerprint") or ws["scope_fingerprint"],
        "ready_ambient_fingerprint": details.get("ambient_fingerprint") or ws["ambient_fingerprint"],
        "allowed_commit_paths": sorted(allowed),
        "required_commit_paths": sorted(required),
        "head_before": git(root, "rev-parse", "HEAD").stdout.strip(),
        "captured_at": utc_now(),
    }
    atomic_write(guard_path(root, plan_id(plan)), json.dumps(rec, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(f"COMMIT_GUARD_CAPTURED kind={kind} scope={rec['ready_scope_fingerprint']} paths={len(allowed)}")
    return 0


def commit_paths(root: Path, commit: str) -> set[str]:
    out = git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", commit).stdout.splitlines()
    return {line.strip().replace("\\", "/") for line in out if line.strip()}


def verify(plan: Path, commit: str, commit_kind: str | None = None) -> int:
    root = find_repo_root(plan)
    path = guard_path(root, plan_id(plan))
    if not path.is_file():
        print("COMMIT_GUARD_MISSING", file=sys.stderr)
        return 1
    try:
        rec = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("COMMIT_GUARD_INVALID", file=sys.stderr)
        return 1

    if rec.get("schema") not in {SCHEMA, SCHEMA_LEGACY}:
        print("COMMIT_GUARD_INVALID", file=sys.stderr)
        return 1

    kind = (commit_kind or rec.get("commit_kind") or "FINAL").upper()
    if kind == "FINAL" and rec.get("pending_todos"):
        print("FINAL_COMMIT_BLOCKED_PENDING_TODO: " + ", ".join(rec["pending_todos"]), file=sys.stderr)
        return 1

    exists = git(root, "cat-file", "-e", f"{commit}^{{commit}}", check=False)
    if exists.returncode:
        print(f"IMPLEMENTATION_COMMIT_NOT_FOUND: {commit}", file=sys.stderr)
        return 1
    sha = git(root, "rev-parse", commit).stdout.strip()
    current_head = git(root, "rev-parse", "HEAD").stdout.strip()
    if current_head != sha:
        print(f"IMPLEMENTATION_COMMIT_NOT_HEAD: commit={sha} head={current_head}", file=sys.stderr)
        return 1

    ancestor = git(root, "merge-base", "--is-ancestor", str(rec.get("head_before", "")), sha, check=False)
    if ancestor.returncode:
        print(f"IMPLEMENTATION_COMMIT_NOT_DESCENDANT: base={rec.get('head_before')} commit={sha}", file=sys.stderr)
        return 1

    ws = workspace_inspect(plan, allow_head_change=True)
    if kind == "FINAL":
        if ws["scope_fingerprint"] != rec.get("ready_scope_fingerprint"):
            print(
                f"COMMIT_GUARD_SCOPE_FINGERPRINT_MISMATCH: ready={rec.get('ready_scope_fingerprint')} current={ws['scope_fingerprint']}",
                file=sys.stderr,
            )
            return 1
        if ws["ambient_fingerprint"] != rec.get("ready_ambient_fingerprint") or not ws["ambient_stable"]:
            print("POST_COMMIT_AMBIENT_DRIFT", file=sys.stderr)
            return 1
        if ws["plan_semantic_changed"]:
            print("POST_COMMIT_PLAN_SEMANTIC_DRIFT", file=sys.stderr)
            return 1
        if ws["unexpected_dirty"]:
            print("POST_COMMIT_UNEXPECTED_DIRTY: " + ", ".join(ws["unexpected_dirty"]), file=sys.stderr)
            return 1

        actual = commit_paths(root, sha)
        allowed = set(rec.get("allowed_commit_paths", []))
        required = set(rec.get("required_commit_paths", []))
        extra = sorted(actual - allowed)
        missing = sorted(required - actual)
        if extra:
            print("IMPLEMENTATION_COMMIT_SCOPE_DRIFT: " + ", ".join(extra), file=sys.stderr)
            return 1
        if missing:
            print("IMPLEMENTATION_COMMIT_SCOPE_MISSING: " + ", ".join(missing), file=sys.stderr)
            return 1

        residual = sorted(dirty_paths(root) & allowed)
        if residual:
            print("POST_COMMIT_SCOPE_RESIDUAL: " + ", ".join(residual), file=sys.stderr)
            return 1

    rec["verified_commit"] = sha
    rec["verified_at"] = utc_now()
    rec["verified_commit_kind"] = kind
    if kind == "FINAL":
        rec["verified_commit_paths"] = sorted(commit_paths(root, sha))
    atomic_write(path, json.dumps(rec, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(f"IMPLEMENTATION_COMMIT_VERIFIED kind={kind} {sha} scope={ws['scope_fingerprint']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("capture")
    p.add_argument("plan", type=Path)
    p.add_argument("--kind", choices=sorted(COMMIT_KINDS), default="FINAL")
    p = sub.add_parser("verify")
    p.add_argument("plan", type=Path)
    p.add_argument("--commit", required=True)
    p.add_argument("--kind", choices=sorted(COMMIT_KINDS), default=None)
    args = ap.parse_args()
    plan = args.plan.resolve()
    if not plan.is_file():
        print(f"PLAN_NOT_FOUND: {plan}", file=sys.stderr)
        return 2
    if args.cmd == "capture":
        return capture(plan, args.kind)
    return verify(plan, args.commit, args.kind)


if __name__ == "__main__":
    raise SystemExit(main())
