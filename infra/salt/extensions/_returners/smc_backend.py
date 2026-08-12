"""Returner that writes redacted job results to a local sink. Never emits secret plaintext."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
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


def _sink_path() -> Path:
    override = os.environ.get("SMC_SALT_RETURN_SINK", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "lab" / "returns" / "jobs.jsonl"


def returner(ret: dict[str, Any]) -> bool:
    payload = {
        "jid": ret.get("jid"),
        "minion": ret.get("id"),
        "fun": ret.get("fun"),
        "success": ret.get("success"),
        "returned_at": datetime.now(UTC).isoformat(),
        "return": _redact(ret.get("return")),
    }
    path = _sink_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return True
