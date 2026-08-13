"""Trusted Ring 0 target snapshot — caller may only supply endpoint IDs."""

from __future__ import annotations

from typing import Any

from core.errors import ErrorCode, SaltControlError
from db.repositories.interfaces import RepositoryBundle
from integrations.management_backend import ManagementBackend

MASTER_ID = "192.168.102.104"
SYSTEM_ACCOUNTS = frozenset({"system", "nt authority\\system", "nt authority/system", "localsystem", ""})


async def resolve_ring0_snapshot(
    requested: list[dict[str, Any]],
    *,
    repos: RepositoryBundle,
    backend: ManagementBackend | None,
    release_id: str,
    config_revision: str,
) -> list[dict[str, Any]]:
    if len(requested) != 5:
        raise SaltControlError(
            ErrorCode.VALIDATION_ERROR, "Ring 0 requires exactly 5 IT/dev endpoints", status_code=400
        )
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for raw in requested:
        endpoint_id = str(raw.get("endpoint_id") or raw.get("endpointId") or "")
        if not endpoint_id.startswith("ep_"):
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "invalid endpoint_id", status_code=400)
        if endpoint_id in seen:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "duplicate endpoint_id", status_code=400)
        seen.add(endpoint_id)
        endpoint = await repos.endpoints.get(endpoint_id)
        binding = await repos.bindings.get_active(endpoint_id)
        backend_binding = None
        desired = None
        if backend is not None:
            try:
                backend_binding = await backend.get_binding(endpoint_id)
                desired = await backend.get_desired_state(endpoint_id)
            except SaltControlError:
                raise
            except Exception:
                backend_binding = None
                desired = None
        windows_account = ""
        windows_sid = ""
        profile_dir = ""
        binding_revision = ""
        if binding is not None:
            windows_account = binding.windows_account
            windows_sid = binding.windows_sid
            profile_dir = binding.profile_dir
            binding_revision = binding.revision
        elif backend_binding is not None:
            windows_account = backend_binding.windows_account
            windows_sid = backend_binding.windows_sid
            profile_dir = backend_binding.profile_dir
            binding_revision = backend_binding.revision
        if not all(str(item).strip() for item in (windows_account, windows_sid, profile_dir, binding_revision)):
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding fields incomplete", status_code=400)
        if windows_account.strip().lower() in SYSTEM_ACCOUNTS:
            raise SaltControlError(ErrorCode.VALIDATION_ERROR, "binding must not be System", status_code=400)
        group = "it"
        if desired is not None and str(getattr(desired, "ring", "")).lower() in {"it", "developer"}:
            group = str(desired.ring).lower()
        status = endpoint.status if endpoint is not None else "unknown"
        normalized.append(
            {
                "endpoint_id": endpoint_id,
                "minion_id": endpoint_id,
                "tenant_id": endpoint.tenant_id if endpoint is not None else "",
                "group": group,
                "status": status,
                "windows_account": windows_account,
                "windows_sid": windows_sid,
                "profile_dir": profile_dir,
                "binding_revision": binding_revision,
                "release_id": release_id,
                "config_revision": config_revision,
                "pillar_revision": desired.revision if desired is not None else "",
                "master_id": MASTER_ID,
                "factsTrusted": endpoint is not None,
            }
        )
    return normalized
