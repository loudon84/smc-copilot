"""Returner that writes redacted job results to a local mock backend sink."""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_UTILS_PARENT = Path(__file__).resolve().parents[1]
if str(_UTILS_PARENT) not in sys.path:
    sys.path.insert(0, str(_UTILS_PARENT))

from _utils.redact import redact_mapping

__virtualname__ = "smc_backend"


def __virtual__():
    return __virtualname__


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
        "return": redact_mapping(ret.get("return")),
    }
    path = _sink_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return True
