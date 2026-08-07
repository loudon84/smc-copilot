"""Internal Hermes execution events (PRD v1.2 §6) — not Desktop-facing."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

HermesExecutionEventType = Literal[
    "session",
    "message_delta",
    "message_completed",
    "reasoning_delta",
    "reasoning_completed",
    "tool_started",
    "tool_progress",
    "tool_completed",
    "tool_failed",
    "usage",
    "clarify_requested",
    "approval_requested",
    "completed",
    "failed",
    "cancelled",
]


@dataclass(slots=True)
class HermesExecutionEvent:
    type: HermesExecutionEventType
    payload: dict[str, Any] = field(default_factory=dict)


# Maps HermesExecutionEvent → durable ChatRun event_type
HERMES_TO_CHAT_EVENT: dict[HermesExecutionEventType, str] = {
    "session": "session.started",
    "message_delta": "agent.message.delta",
    "message_completed": "agent.message.completed",
    "reasoning_delta": "reasoning.delta",
    "reasoning_completed": "reasoning.completed",
    "tool_started": "tool.started",
    "tool_progress": "tool.progress",
    "tool_completed": "tool.completed",
    "tool_failed": "tool.failed",
    "usage": "usage.updated",
    "clarify_requested": "clarify.requested",
    "approval_requested": "approval.requested",
    "completed": "turn.completed",
    "failed": "turn.failed",
    "cancelled": "turn.cancelled",
}


def map_hermes_event_to_chat(event: HermesExecutionEvent) -> tuple[str, dict[str, Any]]:
    """Return (chat_event_type, payload) for ChatEventStore.append."""
    chat_type = HERMES_TO_CHAT_EVENT[event.type]
    return chat_type, dict(event.payload)


def parse_hermes_sse_block(block: str) -> list[HermesExecutionEvent]:
    """Parse one SSE block from Hermes /v1/chat/completions into structured events."""
    events: list[HermesExecutionEvent] = []
    event_type = ""
    data_line = ""
    for line in block.split("\n"):
        if line.startswith("event: "):
            event_type = line[7:].strip()
        elif line.startswith("data: "):
            data_line = line[6:]

    if not data_line:
        return events

    if event_type == "hermes.tool.progress":
        try:
            payload = json.loads(data_line)
            if isinstance(payload, dict):
                name = str(payload.get("tool") or payload.get("name") or "tool")
                label = str(payload.get("label") or name)
                status = str(payload.get("status") or "progress").lower()
                call_id = str(payload.get("call_id") or payload.get("id") or name)
                if status in ("started", "start"):
                    events.append(
                        HermesExecutionEvent(
                            type="tool_started",
                            payload={"callId": call_id, "name": name, "label": label},
                        )
                    )
                elif status in ("completed", "done", "success"):
                    events.append(
                        HermesExecutionEvent(
                            type="tool_completed",
                            payload={"callId": call_id, "name": name, "label": label},
                        )
                    )
                elif status in ("failed", "error"):
                    events.append(
                        HermesExecutionEvent(
                            type="tool_failed",
                            payload={"callId": call_id, "name": name, "label": label},
                        )
                    )
                else:
                    events.append(
                        HermesExecutionEvent(
                            type="tool_progress",
                            payload={"callId": call_id, "name": name, "label": label},
                        )
                    )
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return events

    if event_type in ("hermes.clarify", "clarify"):
        try:
            payload = json.loads(data_line)
            if isinstance(payload, dict):
                events.append(HermesExecutionEvent(type="clarify_requested", payload=payload))
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return events

    if data_line == "[DONE]":
        return events

    try:
        parsed = json.loads(data_line)
    except (json.JSONDecodeError, TypeError, ValueError):
        return events

    if not isinstance(parsed, dict):
        return events

    if parsed.get("error"):
        err = parsed["error"]
        message = err.get("message") if isinstance(err, dict) else str(err)
        events.append(
            HermesExecutionEvent(
                type="failed",
                payload={
                    "message": message or "Provider error",
                    "details": parsed,
                    "errorCode": "PROVIDER_ERROR",
                },
            )
        )
        return events

    usage = parsed.get("usage")
    if isinstance(usage, dict):
        events.append(
            HermesExecutionEvent(
                type="usage",
                payload={
                    "promptTokens": int(usage.get("prompt_tokens") or 0),
                    "completionTokens": int(usage.get("completion_tokens") or 0),
                    "totalTokens": int(usage.get("total_tokens") or 0),
                },
            )
        )

    choice = (parsed.get("choices") or [{}])[0] if isinstance(parsed.get("choices"), list) else {}
    if not isinstance(choice, dict):
        return events
    delta = choice.get("delta") if isinstance(choice.get("delta"), dict) else {}
    content = delta.get("content") if isinstance(delta, dict) else None
    reasoning = None
    if isinstance(delta, dict):
        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
    if content:
        events.append(
            HermesExecutionEvent(
                type="message_delta",
                payload={"content": content, "text": content},
            )
        )
    if reasoning:
        events.append(
            HermesExecutionEvent(
                type="reasoning_delta",
                payload={"content": reasoning, "text": reasoning},
            )
        )
    return events
