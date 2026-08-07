from __future__ import annotations

import json
from typing import Any

from db.models.task_related import TaskEvent


def parse_last_event_id(header: str | None) -> str | None:
    if not header:
        return None
    value = header.strip()
    return value or None


def parse_event_payload(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"raw": raw}


def task_event_to_data(event: TaskEvent) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": event.id,
        "task_id": event.task_id,
        "event_type": event.event_type,
        "message": event.message,
        "run_id": event.run_id,
        "created_at": event.created_at.isoformat(),
    }
    payload = parse_event_payload(event.event_payload)
    if payload is not None:
        data["event_payload"] = payload
    return data


def format_sse(*, event_id: str, event_name: str, data: dict[str, Any]) -> str:
    body = json.dumps(data, default=str)
    return f"id: {event_id}\nevent: {event_name}\ndata: {body}\n\n"


def format_ping(*, event_id: str = "ping") -> str:
    return format_sse(event_id=event_id, event_name="ping", data={"type": "ping"})


def stream_sse_headers(
    *,
    origin: str | None = None,
    allowed_origins: list[str] | None = None,
) -> dict[str, str]:
    allowed = allowed_origins or ["http://127.0.0.1", "http://localhost"]
    allow_origin = origin if origin and origin in allowed else allowed[0]
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Credentials": "true",
    }


# Backward-compatible default (tests / callers without Request)
STREAM_SSE_HEADERS = stream_sse_headers()
