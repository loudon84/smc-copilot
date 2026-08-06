"""Desired-state reconciliation plan builder (PRD FR-17)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class InstalledResource:
    resource_type: str
    resource_id: str
    version: str | None = None


@dataclass
class DesiredResource:
    resource_type: str
    resource_id: str
    version: str | None = None
    apply_mode: str = "managed"
    checksum: str | None = None
    artifact_url: str | None = None
    signature: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlanOperation:
    operation: str  # install | upgrade | remove
    resource_type: str
    resource_id: str
    from_version: str | None
    to_version: str | None


@dataclass
class ReconciliationPlan:
    revision: int
    operations: list[PlanOperation] = field(default_factory=list)
    restart_required: bool = False
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "revision": self.revision,
            "operations": [
                {
                    "operation": op.operation,
                    "resourceType": op.resource_type,
                    "resourceId": op.resource_id,
                    "fromVersion": op.from_version,
                    "toVersion": op.to_version,
                }
                for op in self.operations
            ],
            "restartRequired": self.restart_required,
            "warnings": list(self.warnings),
        }


_RESTART_TYPES = frozenset({"profile", "plugin", "mcp"})


def parse_desired_resource(item: dict[str, Any]) -> DesiredResource:
    return DesiredResource(
        resource_type=str(item.get("resourceType") or item.get("resource_type") or ""),
        resource_id=str(item.get("resourceId") or item.get("resource_id") or ""),
        version=(item.get("version") if item.get("version") is not None else None),
        apply_mode=str(item.get("applyMode") or item.get("apply_mode") or "managed"),
        checksum=item.get("checksum"),
        artifact_url=item.get("artifactUrl") or item.get("artifact_url"),
        signature=item.get("signature"),
        raw=item,
    )


def build_reconciliation_plan(
    *,
    revision: int,
    desired: list[DesiredResource],
    installed: list[InstalledResource],
    removed_resources: list[dict[str, Any]] | None = None,
) -> ReconciliationPlan:
    """Compare desired vs installed and produce install/upgrade/remove ops."""
    plan = ReconciliationPlan(revision=revision)
    installed_map = {(r.resource_type, r.resource_id): r for r in installed}
    desired_map = {(r.resource_type, r.resource_id): r for r in desired if r.resource_type and r.resource_id}

    for key, d in desired_map.items():
        cur = installed_map.get(key)
        if cur is None:
            plan.operations.append(
                PlanOperation("install", d.resource_type, d.resource_id, None, d.version)
            )
            if d.resource_type in _RESTART_TYPES:
                plan.restart_required = True
        elif (cur.version or "") != (d.version or ""):
            plan.operations.append(
                PlanOperation("upgrade", d.resource_type, d.resource_id, cur.version, d.version)
            )
            if d.resource_type in _RESTART_TYPES:
                plan.restart_required = True
            if not d.checksum:
                plan.warnings.append(f"missing checksum for {d.resource_type}/{d.resource_id}")

    if removed_resources is not None:
        for item in removed_resources:
            rtype = str(item.get("resourceType") or item.get("resource_type") or "")
            rid = str(item.get("resourceId") or item.get("resource_id") or "")
            if not rtype or not rid:
                continue
            cur = installed_map.get((rtype, rid))
            plan.operations.append(
                PlanOperation("remove", rtype, rid, cur.version if cur else None, None)
            )
            if rtype in _RESTART_TYPES:
                plan.restart_required = True
    else:
        for key, cur in installed_map.items():
            if key not in desired_map and cur.resource_type not in {"local_secret", "local_path"}:
                plan.operations.append(
                    PlanOperation("remove", cur.resource_type, cur.resource_id, cur.version, None)
                )
                if cur.resource_type in _RESTART_TYPES:
                    plan.restart_required = True

    return plan
