#!/usr/bin/env python3
"""Unified work-scope entry: target apps, local UX context, token budget."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Allow running as a script from this directory.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from frontend_app_registry import discover, load_registry  # noqa: E402
from token_budget import budget_for  # noqa: E402
from ux_context_resolver import generate_baseline, resolve_surface  # noqa: E402

SCHEMA = "smc.ges.work-scope.v1"


def _norm_profile(profile: str | None) -> str:
    key = (profile or "LEAN").strip().upper()
    return key if key in {"LEAN", "FULL"} else "LEAN"


# @lat: [[frontend-context#Work Scope Resolver]]
def resolve_work_scope(
    repo: str | Path,
    *,
    governance_profile: str | None = None,
    target_app_ids: list[str] | None = None,
    ux_role: str | None = None,
    action_cluster: str | None = None,
    ensure_baselines: bool = True,
) -> dict[str, Any]:
    """Resolve work scope, governance tip, target apps, local context, token budget."""
    root = Path(repo).resolve()
    profile = _norm_profile(governance_profile)
    registry = load_registry(root) or discover(root)
    apps = list(registry.get("apps") or [])

    if target_app_ids:
        wanted = set(target_app_ids)
        selected = [a for a in apps if a.get("app_id") in wanted]
    else:
        selected = list(apps)

    local_context: dict[str, Any] = {"apps": {}}
    for app in selected:
        app_id = str(app.get("app_id"))
        if ensure_baselines:
            baseline = generate_baseline(root, app_id)
        else:
            baseline = {"app_id": app_id, "surfaces": []}
        surfaces = []
        if ux_role:
            surfaces = resolve_surface(root, app_id, ux_role, action_cluster=action_cluster)
        local_context["apps"][app_id] = {
            "app": app,
            "baseline_dir": f".agents/ges/frontend/apps/{app_id}",
            "surface_candidates": surfaces,
            "surface_count": len(baseline.get("surfaces") or surfaces),
            "stack_adapter": app.get("stack_adapter"),
        }

    tip = "FULL" if profile == "FULL" else "LEAN"
    return {
        "schema": SCHEMA,
        "repo": str(root),
        "governance_tip": tip,
        "governance_profile": profile,
        "target_apps": [a.get("app_id") for a in selected],
        "apps": selected,
        "local_context": local_context,
        "token_budget": budget_for(profile),
        "apps_registry_schema": registry.get("schema"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GES work scope resolver")
    parser.add_argument("repo", help="Consumer repository root")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--profile", default="LEAN", choices=["LEAN", "FULL", "lean", "full"])
    parser.add_argument("--app", action="append", dest="apps", help="Target app_id (repeatable)")
    parser.add_argument("--ux-role", default=None)
    args = parser.parse_args(argv)

    result = resolve_work_scope(
        args.repo,
        governance_profile=args.profile,
        target_app_ids=args.apps,
        ux_role=args.ux_role,
    )
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.json:
        print(text)
    else:
        print(f"schema={result['schema']}")
        print(f"governance_tip={result['governance_tip']}")
        print(f"target_apps={','.join(result['target_apps']) or '(none)'}")
        print(f"token_budget.model_max_tier={result['token_budget']['model_max_tier']}")
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
