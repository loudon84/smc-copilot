"""HTTPS job returner → Salt Control batch API; lab JSONL only when SMC_SALT_ENV=lab|test.

Failed sends spool to an encrypted directory (Fernet / machine key for tests; DPAPI on Windows ops).
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

__virtualname__ = "smc_backend"


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


def _salt_env() -> str:
    return os.environ.get("SMC_SALT_ENV", "lab").strip().lower() or "lab"


def _is_lab() -> bool:
    return _salt_env() in {"lab", "test"}


def _sink_path() -> Path:
    override = os.environ.get("SMC_SALT_RETURN_SINK", "").strip()
    if override:
        return Path(override)
    if not _is_lab():
        raise RuntimeError("lab JSONL return sink forbidden outside SMC_SALT_ENV=lab|test")
    return Path(__file__).resolve().parents[2] / "lab" / "returns" / "jobs.jsonl"


def _spool_dir() -> Path:
    override = os.environ.get("SMC_SALT_RETURN_SPOOL", "").strip()
    if override:
        return Path(override)
    program_data = os.environ.get("ProgramData", r"C:\ProgramData")
    return Path(program_data) / "SMC" / "return-spool"


def _fernet():
    import base64
    import hashlib

    from cryptography.fernet import Fernet

    seed = os.environ.get("SMC_RETURN_SPOOL_KEY", "smc-lab-return-spool").encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(seed).digest())
    return Fernet(key)


def _encrypt_spool(payload: dict[str, Any]) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    try:
        return _fernet().encrypt(raw)
    except Exception:  # noqa: BLE001
        key = os.environ.get("SMC_RETURN_SPOOL_KEY", "smc-lab-return-spool").encode("utf-8")
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))


def _decrypt_spool(blob: bytes) -> dict[str, Any]:
    try:
        raw = _fernet().decrypt(blob)
    except Exception:  # noqa: BLE001
        key = os.environ.get("SMC_RETURN_SPOOL_KEY", "smc-lab-return-spool").encode("utf-8")
        raw = bytes(b ^ key[i % len(key)] for i, b in enumerate(blob))
    return json.loads(raw.decode("utf-8"))


def _write_spool(payload: dict[str, Any]) -> Path:
    directory = _spool_dir()
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{int(time.time() * 1000)}_{uuid.uuid4().hex}.bin"
    path = directory / name
    path.write_bytes(_encrypt_spool(payload))
    return path


def _post_batch(items: list[dict[str, Any]]) -> bool:
    base = os.environ.get("SMC_SALT_CONTROL_URL", "").strip()
    if not base:
        return False
    import httpx

    cred = os.environ.get("SMC_DEVICE_CREDENTIAL", "").strip()
    headers = {"Authorization": f"Device {cred}"} if cred else {}
    # Contract: items + payloadRedacted (camelCase aliases accepted by Salt Control).
    resp = httpx.post(
        f"{base.rstrip('/')}/salt/v1/job-returns:batch",
        headers=headers,
        json={"requestId": str(uuid.uuid4()), "items": items},
        timeout=30.0,
    )
    resp.raise_for_status()
    return True


def returner(ret: dict[str, Any]) -> bool:
    item = {
        "jid": ret.get("jid"),
        "endpointId": ret.get("id"),
        "function": ret.get("fun"),
        "success": ret.get("success"),
        "payloadRedacted": _redact(ret.get("return")),
    }
    # Prefer HTTPS batch when Salt Control URL is configured.
    if os.environ.get("SMC_SALT_CONTROL_URL", "").strip():
        try:
            return _post_batch([item])
        except Exception:  # noqa: BLE001 — spool and continue
            _write_spool(item)
            return False

    if _is_lab():
        path = _sink_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        lab_payload = {
            "jid": item["jid"],
            "minion": item["endpointId"],
            "fun": item["function"],
            "success": item["success"],
            "return": item["payloadRedacted"],
        }
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(lab_payload, ensure_ascii=False) + "\n")
        return True

    # Production without URL: encrypt spool only (fail closed for plaintext sink).
    _write_spool(item)
    return False


def flush_spool(limit: int = 100) -> dict[str, Any]:
    """Retry encrypted spool against Salt Control."""
    directory = _spool_dir()
    if not directory.is_dir():
        return {"ok": True, "flushed": 0}
    flushed = 0
    errors = 0
    for path in sorted(directory.glob("*.bin"))[:limit]:
        try:
            payload = _decrypt_spool(path.read_bytes())
            if _post_batch([payload]):
                path.unlink(missing_ok=True)
                flushed += 1
            else:
                errors += 1
        except Exception:  # noqa: BLE001
            errors += 1
    return {"ok": errors == 0, "flushed": flushed, "errors": errors}
