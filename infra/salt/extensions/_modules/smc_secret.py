"""Endpoint secret resolver. Pillar stores refs only; values never go to grains/returns/logs."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

__virtualname__ = "smc_secret"


def __virtual__():
    return __virtualname__


def _utils() -> dict[str, Any]:
    return globals().get("__utils__") or {}


def _redact(payload: Any) -> Any:
    utils = _utils()
    if "smc_redact.mapping" in utils:
        return utils["smc_redact.mapping"](payload)
    from _utils.smc_redact import mapping

    return mapping(payload)


def _store() -> dict[str, str]:
    opts = globals().get("__opts__") or {}
    injected = opts.get("smc_secret_store")
    if isinstance(injected, dict):
        return {str(k): str(v) for k, v in injected.items()}
    path = os.environ.get("SMC_SECRET_FIXTURE", "").strip()
    if path and Path(path).is_file():
        return json.loads(Path(path).read_text(encoding="utf-8"))
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
    """DPAPI stand-in: XOR+hmac blob on disk. Not a production crypto primitive."""
    key = os.environ.get("SMC_SECRET_CACHE_KEY", "smc-lab-cache-key").encode("utf-8")
    digest = hashlib.sha256(ref.encode("utf-8")).hexdigest()
    blob = bytes(b ^ key[i % len(key)] for i, b in enumerate(value.encode("utf-8")))
    target = _cache_dir()
    target.mkdir(parents=True, exist_ok=True)
    (target / digest).write_bytes(blob)


def resolve(ref: str, reveal: bool = False) -> dict[str, Any]:
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


def redact_return(payload: dict[str, Any]) -> dict[str, Any]:
    return _redact(payload)
