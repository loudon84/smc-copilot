"""Parse Salt job return payloads into success/failure (shared by Worker + Returner)."""

from __future__ import annotations

from typing import Any


def parse_job_success(job: dict[str, Any] | None, minion_id: str) -> bool | None:
    """Return True/False when a result is present, else None if still pending."""
    if not job:
        return None
    ret = job.get("return")
    value: Any = None
    if isinstance(ret, list) and ret:
        first = ret[0]
        if isinstance(first, dict):
            value = first.get(minion_id, first)
        else:
            value = first
    elif isinstance(ret, dict):
        value = ret.get(minion_id, ret)
    else:
        info = job.get("info")
        if isinstance(info, list) and info and isinstance(info[0], dict):
            result = info[0].get("Result") or info[0].get("return")
            if isinstance(result, dict):
                entry = result.get(minion_id)
                if isinstance(entry, dict):
                    value = entry.get("return", entry)
                else:
                    value = entry
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, dict):
        if "ok" in value:
            return bool(value.get("ok"))
        if all(isinstance(v, dict) for v in value.values()):
            return all(bool(v.get("result", True)) for v in value.values())
        return True
    return bool(value)
