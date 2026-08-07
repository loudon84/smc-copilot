"""Shared helpers for resource adapters."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from runtime.resources.base import ApplyResult, ResourceContext, ResourceDesired, ResourceRollbackSnapshot


def resource_base(ctx: ResourceContext, resource_type: str, resource_id: str) -> Path:
    return ctx.resources_root / resource_type / resource_id


def version_dir(ctx: ResourceContext, resource_type: str, resource_id: str, version: str) -> Path:
    return resource_base(ctx, resource_type, resource_id) / "versions" / version


def current_pointer_path(ctx: ResourceContext, resource_type: str, resource_id: str) -> Path:
    return resource_base(ctx, resource_type, resource_id) / "current.json"


def read_current_pointer(ctx: ResourceContext, resource_type: str, resource_id: str) -> dict[str, Any]:
    path = current_pointer_path(ctx, resource_type, resource_id)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def write_current_pointer(
    ctx: ResourceContext, resource_type: str, resource_id: str, version: str, ver_path: Path
) -> None:
    base = resource_base(ctx, resource_type, resource_id)
    base.mkdir(parents=True, exist_ok=True)
    current_pointer_path(ctx, resource_type, resource_id).write_text(
        json.dumps({"version": version, "path": str(ver_path)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_resource_meta(
    ctx: ResourceContext,
    resource_type: str,
    resource_id: str,
    *,
    version: str | None,
    revision: int,
    payload: dict[str, Any],
    from_version: str | None,
) -> Path:
    base = resource_base(ctx, resource_type, resource_id)
    base.mkdir(parents=True, exist_ok=True)
    meta_path = base / "resource.json"
    safe_payload = {k: v for k, v in payload.items() if k not in {"secret", "secrets", "apiKey"}}
    meta = {
        "resourceType": resource_type,
        "resourceId": resource_id,
        "version": version,
        "revision": revision,
        "ownership": "center",
        "payload": safe_payload,
        "fromVersion": from_version,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta_path


def capture_snapshot(
    ctx: ResourceContext, resource_type: str, resource_id: str, version: str | None
) -> ResourceRollbackSnapshot:
    base = resource_base(ctx, resource_type, resource_id)
    meta_path = base / "resource.json"
    meta_json = meta_path.read_text(encoding="utf-8") if meta_path.is_file() else None
    ptr_path = current_pointer_path(ctx, resource_type, resource_id)
    ptr_json = ptr_path.read_text(encoding="utf-8") if ptr_path.is_file() else None
    pointer = read_current_pointer(ctx, resource_type, resource_id)
    local_path = pointer.get("path") or str(base)
    return ResourceRollbackSnapshot(
        resource_type=resource_type,
        resource_id=resource_id,
        version=version,
        local_path=str(local_path),
        meta_json=meta_json,
        current_pointer_json=ptr_json,
    )


def restore_snapshot(ctx: ResourceContext, snapshot: ResourceRollbackSnapshot) -> None:
    base = resource_base(ctx, snapshot.resource_type, snapshot.resource_id)
    if not snapshot.meta_json and not snapshot.current_pointer_json:
        if base.exists():
            shutil.rmtree(base, ignore_errors=True)
        return
    if snapshot.version:
        ver_dir = version_dir(ctx, snapshot.resource_type, snapshot.resource_id, snapshot.version)
        if ver_dir.exists():
            write_current_pointer(ctx, snapshot.resource_type, snapshot.resource_id, snapshot.version, ver_dir)
    if snapshot.current_pointer_json:
        current_pointer_path(ctx, snapshot.resource_type, snapshot.resource_id).write_text(
            snapshot.current_pointer_json, encoding="utf-8"
        )
    if snapshot.meta_json:
        base.mkdir(parents=True, exist_ok=True)
        (base / "resource.json").write_text(snapshot.meta_json, encoding="utf-8")


def copy_staged_to_version(
    ctx: ResourceContext, desired: ResourceDesired, staged: Path, *, restart_required: bool = False
) -> ApplyResult:
    ver = desired.version or "unknown"
    dest = version_dir(ctx, desired.resource_type, desired.resource_id, ver)
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    if staged.is_dir():
        shutil.copytree(staged, dest)
    else:
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(staged, dest / staged.name)
    write_current_pointer(ctx, desired.resource_type, desired.resource_id, ver, dest)
    write_resource_meta(
        ctx,
        desired.resource_type,
        desired.resource_id,
        version=desired.version,
        revision=desired.revision,
        payload=desired.payload,
        from_version=desired.from_version,
    )
    return ApplyResult(status="installed", path=str(dest), restart_required=restart_required)


async def default_validate(desired: ResourceDesired) -> list[str]:
    errors: list[str] = []
    if desired.artifact_url and not desired.checksum:
        errors.append(f"missing checksum for artifact URL on {desired.resource_id}")
    return errors


async def default_stage(ctx: ResourceContext, desired: ResourceDesired) -> Path:
    stage_dir = ctx.staging_root / f"{desired.resource_type}-{desired.resource_id}-{desired.version or 'none'}"
    if stage_dir.exists():
        shutil.rmtree(stage_dir, ignore_errors=True)
    stage_dir.mkdir(parents=True, exist_ok=True)
    if desired.artifact_url and desired.checksum:
        await ctx.artifact_cache.fetch_and_extract(
            desired.artifact_url,
            stage_dir,
            expected_sha256=desired.checksum,
        )
    else:
        # Metadata-only: write payload for downstream apply
        (stage_dir / "payload.json").write_text(
            json.dumps(desired.payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return stage_dir


async def default_verify(
    ctx: ResourceContext, desired: ResourceDesired, *, restart_types: frozenset[str] = frozenset()
) -> dict[str, Any]:
    pointer = read_current_pointer(ctx, desired.resource_type, desired.resource_id)
    ver_path = pointer.get("path")
    exists = ver_path and Path(ver_path).exists()
    version_match = pointer.get("version") == desired.version if desired.version else exists
    return {
        "resourceType": desired.resource_type,
        "resourceId": desired.resource_id,
        "probed": True,
        "filesystem": bool(exists),
        "versionMatch": bool(version_match),
        "installedVersion": pointer.get("version"),
        "path": ver_path,
        "hermesAvailable": ctx.hermes_cli is not None,
    }


async def default_remove(ctx: ResourceContext, desired: ResourceDesired) -> ApplyResult:
    base = resource_base(ctx, desired.resource_type, desired.resource_id)
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)
    return ApplyResult(status="removed")
