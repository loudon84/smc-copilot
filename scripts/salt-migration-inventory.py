#!/usr/bin/env python3
"""Scan services/runtime Endpoint Control Plane coverage for Salt replacement.

Outputs migration-inventory.json and migration-inventory.md at repo root
(or --out-dir). Classification: FULL=1.0, PARTIAL=0.5, NO=0.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

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


def count_loc(path: Path) -> int:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    return sum(1 for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#"))


def classify_file(stem: str, mapping: dict[str, str]) -> str:
    return mapping.get(stem, "NO")


def scan_py_dir(kind: str, directory: Path, mapping: dict[str, str]) -> list[Item]:
    items: list[Item] = []
    if not directory.is_dir():
        return items
    for path in sorted(directory.glob("*.py")):
        if path.name.startswith("_"):
            continue
        loc = count_loc(path)
        classification = classify_file(path.stem, mapping)
        items.append(
            Item(
                kind=kind,
                name=path.stem,
                path=str(path.as_posix()),
                loc=loc,
                classification=classification,
                weight=WEIGHT[classification],
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
    lines = [
        "# Salt migration inventory",
        "",
        "Generated by `scripts/salt-migration-inventory.py` (PRD v2.0 / ADR-026).",
        "",
        f"- Generated at: `{report['generated_note']}`",
        f"- Runtime root: `{report['runtime_root']}`",
        "",
        "## Replacement rates",
        "",
        "| Scope | Router/domain % | Service class % | Source LOC % |",
        "| --- | ---: | ---: | ---: |",
        f"| Entire Runtime | {report['entire']['routers']['count']}% | {report['entire']['services']['count']}% | {report['entire']['loc']['loc_weighted']}% |",
        f"| Endpoint Control Plane only | {report['endpoint']['routers']['count']}% | {report['endpoint']['services']['count']}% | {report['endpoint']['loc']['loc_weighted']}% |",
        "",
        "Go threshold (PRD Phase 9): Endpoint API ≥85%, Endpoint Service ≥85%, Endpoint LOC ≥75%.",
        "",
        f"- Endpoint API (routers, excl. NO): **{report['endpoint']['routers']['count']}%**",
        f"- Endpoint Service (excl. NO): **{report['endpoint']['services']['count']}%**",
        f"- Endpoint LOC (routers+services+runtime pkg, excl. NO): **{report['endpoint']['loc']['loc_weighted']}%**",
        "",
        "## Classification key",
        "",
        "- FULL = 1.0 (Salt replaces)",
        "- PARTIAL = 0.5 (config/lifecycle subset)",
        "- NO = 0 (Chat/Task data plane — not Salt)",
        "",
        "## Items",
        "",
        "| Kind | Name | Class | LOC |",
        "| --- | --- | --- | ---: |",
    ]
    for item in report["items"]:
        lines.append(
            f"| {item['kind']} | `{item['name']}` | {item['classification']} | {item['loc']} |"
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

    routers = scan_py_dir("router", src / "api" / "v1", ROUTER_CLASS)
    services = scan_py_dir("service", src / "services", SERVICE_CLASS)
    runtime_pkg = scan_py_dir("runtime_pkg", src / "runtime", RUNTIME_PKG_CLASS)
    all_items = routers + services + runtime_pkg

    entire_loc_items = all_items
    endpoint_items = endpoint_only(all_items)
    endpoint_routers = endpoint_only(routers)
    endpoint_services = endpoint_only(services)

    report = {
        "generated_note": "salt-migration-inventory v1 (repo-only, static classification)",
        "runtime_root": str(runtime_root.as_posix()),
        "weights": WEIGHT,
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
        f"LOC={report['endpoint']['loc']['loc_weighted']}%"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
