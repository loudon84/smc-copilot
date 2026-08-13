"""Endpoint secret materialize. Pillar stores refs only; values never go to grains/returns/logs.

Production: Salt Control POST /salt/v1/secrets:resolve — no fixture auto-discovery.
Lab/test (SMC_SALT_ENV=lab|test): injected store / fixture / XOR cache allowed.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

__virtualname__ = "smc_secret"


def __virtual__():
    return __virtualname__


def _utils() -> dict[str, Any]:
    return globals().get("__utils__") or {}


def _redact(payload: Any) -> Any:
    utils = _utils()
    if "smc_redact.mapping" not in utils:
        return payload
    return utils["smc_redact.mapping"](payload)


def _salt_env() -> str:
    return os.environ.get("SMC_SALT_ENV", "lab").strip().lower() or "lab"


def _is_lab() -> bool:
    return _salt_env() in {"lab", "test"}


def _store() -> dict[str, str]:
    opts = globals().get("__opts__") or {}
    injected = opts.get("smc_secret_store")
    if isinstance(injected, dict):
        return {str(k): str(v) for k, v in injected.items()}
    if not _is_lab():
        return {}
    path = os.environ.get("SMC_SECRET_FIXTURE", "").strip()
    if path and Path(path).is_file():
        return json.loads(Path(path).read_text(encoding="utf-8"))
    # Auto fixture discovery — lab/test only.
    fixture = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "secrets.json"
    if fixture.is_file():
        return json.loads(fixture.read_text(encoding="utf-8"))
    return {}


def _cache_dir() -> Path:
    override = os.environ.get("SMC_SECRET_CACHE", "").strip()
    if override:
        return Path(override)
    program_data = os.environ.get("ProgramData", r"C:\ProgramData")
    return Path(program_data) / "SMC" / "secret-cache"


def _cache_put(ref: str, value: str) -> None:
    if not _is_lab():
        # Production: DPAPI User Scope is ops-owned; module does not XOR with default key.
        return
    key = os.environ.get("SMC_SECRET_CACHE_KEY", "smc-lab-cache-key").encode("utf-8")
    digest = hashlib.sha256(ref.encode("utf-8")).hexdigest()
    blob = bytes(b ^ key[i % len(key)] for i, b in enumerate(value.encode("utf-8")))
    target = _cache_dir()
    target.mkdir(parents=True, exist_ok=True)
    (target / digest).write_bytes(blob)


def _resolve_via_salt_control(refs: list[str], endpoint_id: str, user_id: str) -> dict[str, str]:
    base = os.environ.get("SMC_SALT_CONTROL_URL", "").strip()
    if not base:
        return {}
    import uuid

    import httpx

    cred = os.environ.get("SMC_DEVICE_CREDENTIAL", "").strip()
    headers = {"Authorization": f"Device {cred}"} if cred else {}
    resp = httpx.post(
        f"{base.rstrip('/')}/salt/v1/secrets:resolve",
        headers=headers,
        json={
            "endpointId": endpoint_id,
            "userId": user_id,
            "refs": refs,
            "requestId": str(uuid.uuid4()),
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    body = resp.json()
    secrets = body.get("secrets") or body.get("values") or {}
    if isinstance(secrets, list):
        out: dict[str, str] = {}
        for item in secrets:
            if isinstance(item, dict) and item.get("ref") and item.get("value") is not None:
                out[str(item["ref"])] = str(item["value"])
        return out
    return {str(k): str(v) for k, v in secrets.items()}


def resolve(ref: str, reveal: bool = False) -> dict[str, Any]:
    """Deprecated public reveal path — lab only. Prefer materialize()."""
    if reveal and not _is_lab():
        return _redact({"ok": False, "error": "reveal_forbidden_in_production", "ref": ref})
    store = _store()
    value = store.get(ref)
    if value is None:
        payload = {"ok": False, "error": "secret_not_found", "ref": ref}
        return _redact(payload) if not reveal else payload
    _cache_put(ref, value)
    result: dict[str, Any] = {"ok": True, "ref": ref, "cached": True}
    if reveal:
        result["value"] = value
    return result


def materialize(
    refs: list[str] | tuple[str, ...],
    target_env_path: str | Path,
    *,
    endpoint_id: str = "",
    user_id: str = "",
) -> dict[str, Any]:
    """Resolve refs and write Hermes .env via temp file + atomic replace.

    Return payload contains only ref/status — never secret values.
    """
    target = Path(target_env_path)
    values: dict[str, str] = {}
    errors: list[dict[str, str]] = []

    if os.environ.get("SMC_SALT_CONTROL_URL", "").strip():
        try:
            values.update(_resolve_via_salt_control(list(refs), endpoint_id, user_id))
        except Exception as exc:  # noqa: BLE001
            return _redact({"ok": False, "error": "secret_api_failed", "message": str(exc), "refs": list(refs)})

    store = _store()
    statuses: list[dict[str, str]] = []
    for ref in refs:
        value = values.get(ref) or store.get(ref)
        if value is None:
            errors.append({"ref": ref, "status": "missing"})
            statuses.append({"ref": ref, "status": "missing"})
            continue
        _cache_put(ref, value)
        # Map ref last path segment to ENV key when writing .env lines.
        env_key = ref.rstrip("/").split("/")[-1].upper().replace("-", "_")
        if env_key.startswith("SMC://"):
            env_key = "SECRET"
        values[ref] = value
        statuses.append({"ref": ref, "status": "ok", "envKey": env_key})

    if errors and not any(s.get("status") == "ok" for s in statuses):
        return _redact({"ok": False, "error": "secret_not_found", "results": statuses})

    lines: list[str] = []
    if target.is_file():
        lines = target.read_text(encoding="utf-8").splitlines()
    env_map = {s["envKey"]: values[s["ref"]] for s in statuses if s.get("status") == "ok" and "envKey" in s}
    # Replace or append
    written_keys = set()
    new_lines: list[str] = []
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in env_map:
                new_lines.append(f"{key}={env_map[key]}")
                written_keys.add(key)
                continue
        new_lines.append(line)
    for key, val in env_map.items():
        if key not in written_keys:
            new_lines.append(f"{key}={val}")

    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="smc-env-", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(new_lines) + "\n")
        os.replace(tmp_name, target)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)

    return _redact({"ok": True, "results": statuses, "target": str(target)})


def redact_return(payload: dict[str, Any]) -> dict[str, Any]:
    return _redact(payload)
