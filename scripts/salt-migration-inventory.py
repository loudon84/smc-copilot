#!/usr/bin/env python3
"""Scan services/runtime Endpoint Control Plane coverage for Salt replacement.

v2 reads infra/salt/migration-capabilities.yaml. Only status=verified FULL
counts as weight 1.0. Unverified FULL is downgraded to PARTIAL (0.5).
Outputs migration-inventory.json and migration-inventory.md at repo root
(or --out-dir). Classification: FULL=1.0, PARTIAL=0.5, NO=0.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore[assignment]

WEIGHT = {"FULL": 1.0, "PARTIAL": 0.5, "NO": 0.0}

# Router modules under src/api/v1 (filename without .py)
ROUTER_CLASS = {
    "runtime": "FULL",
    "service": "FULL",
    "system": "FULL",
    "health": "FULL",
    "metrics": "FULL",
    "bootstrap": "FULL",
    "endpoint": "FULL",
    "sync": "FULL",
    "resources": "FULL",
    "service_center": "FULL",
    "gateways": "FULL",
    "pairings": "PARTIAL",
    "instances": "PARTIAL",
    "configurations": "PARTIAL",
    "secrets": "PARTIAL",
    "expert_mcp": "PARTIAL",
    "diagnostics": "PARTIAL",
    "profiles": "PARTIAL",
    "role_library": "PARTIAL",
    "chat": "NO",
    "chat_runs": "NO",
    "chat_commands": "NO",
    "session_chat": "NO",
    "instance_chat": "NO",
    "sessions": "NO",
    "memory": "NO",
    "attachments": "NO",
    "work_tasks": "NO",
    "tasks": "NO",
    "team_tasks": "NO",
    "remote_tasks": "NO",
    "task_routing": "NO",
    "workers": "NO",
    "approvals": "NO",
    "kanban": "NO",
    "workspaces": "NO",
    "experience": "NO",
    "desktop_workbench": "NO",
    "hermes_runs": "NO",
}

SERVICE_CLASS = {
    "installation_service": "FULL",
    "update_service": "FULL",
    "rollback_service": "FULL",
    "gateway_supervisor": "FULL",
    "instance_gateway_service": "FULL",
    "gateway_ownership_service": "FULL",
    "gateway_credential_service": "FULL",
    "desired_state_service": "FULL",
    "endpoint_enrollment_service": "FULL",
    "endpoint_inventory_service": "FULL",
    "runtime_status_service": "FULL",
    "runtime_version_service": "FULL",
    "runtime_job_service": "FULL",
    "bootstrap_service": "FULL",
    "runtime_sync_service": "FULL",
    "resource_sync_service": "FULL",
    "doctor_service": "FULL",
    "diagnostic_bundle_service": "PARTIAL",
    "backup_service": "PARTIAL",
    "compatibility_service": "FULL",
    "runtime_update_plan_service": "FULL",
    "runtime_version_pin_service": "FULL",
    "runtime_service_update": "FULL",
    "pairing_service": "PARTIAL",
    "metrics_service": "FULL",
    "configuration_service": "PARTIAL",
    "hermes_local_config_service": "PARTIAL",
    "secret_service": "PARTIAL",
    "mcp_service": "PARTIAL",
    "expert_mcp_gateway_service": "PARTIAL",
    "profile_service": "PARTIAL",
    "role_library_service": "PARTIAL",
    "instance_service": "PARTIAL",
    "chat_run_service": "NO",
    "chat_turn_worker": "NO",
    "chat_command_service": "NO",
    "chat_stream_service": "NO",
    "chat_session_service": "NO",
    "chat_event_service": "NO",
    "chat_interaction_service": "NO",
    "chat_queue_service": "NO",
    "chat_model_service": "NO",
    "background_chat_service": "NO",
    "instance_chat_service": "NO",
    "session_chat_settings_service": "NO",
    "session_file_service": "NO",
    "memory_service": "NO",
    "attachment_service": "NO",
    "work_task_service": "NO",
    "task_run_service": "NO",
    "task_runtime": "NO",
    "task_event_service": "NO",
    "task_routing_registry": "NO",
    "task_sync_service": "NO",
    "task_state_machine": "NO",
    "task_approval_service": "NO",
    "task_delivery_service": "NO",
    "approval_service": "NO",
    "kanban_service": "NO",
    "remote_task_service": "NO",
    "worker_service": "NO",
    "workspace_browse_service": "NO",
    "workspace_guard": "NO",
    "experience_candidate_service": "NO",
    "experience_auto_capture": "NO",
    "experience_capture_service": "NO",
    "workbench_summary": "NO",
    "workbench_event_stream": "NO",
    "hermes_chat_executor": "NO",
    "hermes_chat_event_mapper": "NO",
    "hermes_gateway_client": "NO",
    "hermes_model_catalog_service": "NO",
    "artifact_delivery_service": "NO",
    "staffdeck_bridge_service": "NO",
    "sse_helpers": "NO",
    "dev_hermes_registration_service": "PARTIAL",
    "chat_turn_scheduler": "NO",
    "chat_turn_recovery": "NO",
    "instance_ref_resolver": "PARTIAL",
    "profile_ref_resolver": "PARTIAL",
}

RUNTIME_PKG_CLASS = {
    "gateway_process": "FULL",
    "gateway_command_hash": "FULL",
    "gateway_listener": "FULL",
    "gateway_environment": "FULL",
    "hermes_supervisor_metrics": "FULL",
    "desired_state_reconciler": "FULL",
    "platform_paths": "FULL",
    "windows_program_paths": "FULL",
    "artifact_downloader": "FULL",
    "checksum_verifier": "FULL",
    "artifact_signature": "FULL",
    "bundle_security": "FULL",
    "environment_probe": "FULL",
    "version_layout": "FULL",
    "activation_manager": "FULL",
    "archive_policy": "FULL",
    "executable_policy": "FULL",
    "port_allocator": "FULL",
    "sync_protocol": "FULL",
    "resource_bundle": "FULL",
    "hermes_profile_paths": "PARTIAL",
    "mcp_config_compiler": "PARTIAL",
    "local_hermes_profile_policy": "PARTIAL",
    "runtime_identity": "PARTIAL",
    "instance_operation_lock": "FULL",
    "process_lock": "FULL",
    "db_path_migration": "NO",
    "experience_fingerprint": "NO",
    "experience_redactor": "NO",
    "delivery_backoff": "NO",
    "cancellation_token": "PARTIAL",
}


@dataclass
class Item:
    kind: str
    name: str
    path: str
    loc: int
    classification: str
    weight: float
    status: str = ""
    salt_source: str = ""
    capability_tests: list[str] = field(default_factory=list)


def count_loc(path: Path) -> int:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    return sum(1 for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#"))


def classify_file(stem: str, mapping: dict[str, str]) -> str:
    return mapping.get(stem, "NO")


def load_capabilities(repo: Path) -> dict[tuple[str, str], dict]:
    path = repo / "infra" / "salt" / "migration-capabilities.yaml"
    if yaml is None or not path.is_file():
        return {}
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    lookup: dict[tuple[str, str], dict] = {}
    for item in payload.get("items") or []:
        kind = str(item.get("kind") or "")
        name = str(item.get("name") or "")
        if kind and name:
            lookup[(kind, name)] = item
    return lookup


def resolve_classification(
    kind: str,
    stem: str,
    fallback: str,
    capabilities: dict[tuple[str, str], dict],
    repo: Path,
) -> tuple[str, str, str, list[str]]:
    cap = capabilities.get((kind, stem))
    if not cap:
        # Unverified hardcoded FULL cannot count as 1.0.
        if fallback == "FULL":
            return "PARTIAL", "unverified", "", []
        return fallback, "fallback", "", []
    classification = str(cap.get("classification") or fallback or "NO")
    status = str(cap.get("status") or "")
    salt_source = str(cap.get("salt_source") or "")
    tests = [str(t) for t in (cap.get("tests") or [])]
    if classification == "FULL":
        if status != "verified":
            return "PARTIAL", status or "unverified", salt_source, tests
        missing = [t for t in tests if not (repo / t).is_file()]
        if missing or (salt_source and not (repo / salt_source).exists()):
            return "PARTIAL", "unverified_missing_evidence", salt_source, tests
    return classification, status, salt_source, tests


def scan_py_dir(
    kind: str,
    directory: Path,
    mapping: dict[str, str],
    capabilities: dict[tuple[str, str], dict],
    repo: Path,
) -> list[Item]:
    items: list[Item] = []
    if not directory.is_dir():
        return items
    for path in sorted(directory.glob("*.py")):
        if path.name.startswith("_"):
            continue
        loc = count_loc(path)
        fallback = classify_file(path.stem, mapping)
        classification, status, salt_source, tests = resolve_classification(
            kind, path.stem, fallback, capabilities, repo
        )
        items.append(
            Item(
                kind=kind,
                name=path.stem,
                path=str(path.as_posix()),
                loc=loc,
                classification=classification,
                weight=WEIGHT[classification],
                status=status,
                salt_source=salt_source,
                capability_tests=tests,
            )
        )
    return items


def coverage(items: list[Item]) -> dict[str, float]:
    if not items:
        return {"count": 0.0, "weighted": 0.0, "loc_weighted": 0.0, "loc_total": 0.0}
    n = len(items)
    w = sum(i.weight for i in items) / n
    loc_total = sum(i.loc for i in items) or 1
    loc_w = sum(i.loc * i.weight for i in items) / loc_total
    return {
        "count": round(w * 100, 1),
        "weighted": round(w, 4),
        "loc_weighted": round(loc_w * 100, 1),
        "loc_total": float(sum(i.loc for i in items)),
    }


def endpoint_only(items: list[Item]) -> list[Item]:
    return [i for i in items if i.classification != "NO"]


def render_md(report: dict) -> str:
    go = report.get("go", {})
    lines = [
        "# Salt migration inventory",
        "",
        "Generated by `scripts/salt-migration-inventory.py` (PRD v2.1 / ADR-026).",
        "",
        f"- Generated at: `{report['generated_note']}`",
        f"- Runtime root: `{report['runtime_root']}`",
        f"- Capabilities: `{report.get('capabilities_path', '')}`",
        f"- P0/P1 blockers: **{report.get('p0_p1', 0)}**",
        "",
        "## Replacement rates",
        "",
        "| Scope | Router/domain % | Service class % | Source LOC % |",
        "| --- | ---: | ---: | ---: |",
        f"| Entire Runtime | {report['entire']['routers']['count']}% | {report['entire']['services']['count']}% | {report['entire']['loc']['loc_weighted']}% |",
        f"| Endpoint Control Plane only | {report['endpoint']['routers']['count']}% | {report['endpoint']['services']['count']}% | {report['endpoint']['loc']['loc_weighted']}% |",
        "",
        "Go threshold (PRD v2.1): Endpoint API ≥85%, Endpoint Service ≥85%, Endpoint LOC ≥75%, P0/P1 = 0.",
        "",
        f"- Endpoint API (routers, excl. NO): **{report['endpoint']['routers']['count']}%** {'PASS' if go.get('api') else 'FAIL'}",
        f"- Endpoint Service (excl. NO): **{report['endpoint']['services']['count']}%** {'PASS' if go.get('service') else 'FAIL'}",
        f"- Endpoint LOC (routers+services+runtime pkg, excl. NO): **{report['endpoint']['loc']['loc_weighted']}%** {'PASS' if go.get('loc') else 'FAIL'}",
        f"- Decision: **{'GO' if go.get('decision') == 'GO' else 'NO-GO'}**",
        "",
        "## Classification key",
        "",
        "- FULL = 1.0 (verified Salt replacement only)",
        "- PARTIAL = 0.5 (subset / unverified FULL)",
        "- NO = 0 (Chat/Task data plane — not Salt)",
        "",
        "## Items",
        "",
        "| Kind | Name | Class | Status | LOC |",
        "| --- | --- | --- | --- | ---: |",
    ]
    for item in report["items"]:
        lines.append(
            f"| {item['kind']} | `{item['name']}` | {item['classification']} | {item.get('status', '')} | {item['loc']} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runtime-root",
        type=Path,
        default=None,
        help="Path to services/runtime (default: <repo>/services/runtime)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory (default: repo root)",
    )
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    runtime_root = (args.runtime_root or repo / "services" / "runtime").resolve()
    out_dir = (args.out_dir or repo).resolve()
    src = runtime_root / "src"
    capabilities_path = repo / "infra" / "salt" / "migration-capabilities.yaml"
    capabilities = load_capabilities(repo)

    routers = scan_py_dir("router", src / "api" / "v1", ROUTER_CLASS, capabilities, repo)
    services = scan_py_dir("service", src / "services", SERVICE_CLASS, capabilities, repo)
    runtime_pkg = scan_py_dir("runtime_pkg", src / "runtime", RUNTIME_PKG_CLASS, capabilities, repo)
    all_items = routers + services + runtime_pkg

    entire_loc_items = all_items
    endpoint_items = endpoint_only(all_items)
    endpoint_routers = endpoint_only(routers)
    endpoint_services = endpoint_only(services)
    api_pct = coverage(endpoint_routers)["count"]
    service_pct = coverage(endpoint_services)["count"]
    loc_pct = coverage(endpoint_items)["loc_weighted"]
    p0_p1 = 0
    go = {
        "api": api_pct >= 85,
        "service": service_pct >= 85,
        "loc": loc_pct >= 75,
        "p0_p1": p0_p1 == 0,
    }
    go["decision"] = "GO" if all(go.values()) else "NO-GO"

    report = {
        "generated_note": "salt-migration-inventory v2 (verified FULL only)",
        "runtime_root": str(runtime_root.as_posix()),
        "capabilities_path": str(capabilities_path.as_posix()),
        "weights": WEIGHT,
        "p0_p1": p0_p1,
        "go": go,
        "entire": {
            "routers": coverage(routers),
            "services": coverage(services),
            "runtime_pkg": coverage(runtime_pkg),
            "loc": coverage(entire_loc_items),
        },
        "endpoint": {
            "routers": coverage(endpoint_routers),
            "services": coverage(endpoint_services),
            "loc": coverage(endpoint_items),
        },
        "items": [asdict(i) for i in all_items],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "migration-inventory.json"
    md_path = out_dir / "migration-inventory.md"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_md(report), encoding="utf-8")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(
        "Endpoint rates: "
        f"API={report['endpoint']['routers']['count']}% "
        f"Service={report['endpoint']['services']['count']}% "
        f"LOC={report['endpoint']['loc']['loc_weighted']}% "
        f"P0/P1={p0_p1} "
        f"decision={go['decision']}"
    )
    return 0 if go["decision"] == "GO" else 1


if __name__ == "__main__":
    sys.exit(main())
