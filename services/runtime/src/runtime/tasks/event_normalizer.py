"""Map Hermes SSE events to standard task event types (FR-503)."""

from __future__ import annotations

import json
from typing import Any


def normalize_hermes_sse(event_name: str, data: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Return zero or more (event_type, payload) pairs from a Hermes SSE frame."""
    events: list[tuple[str, dict[str, Any]]] = []

    if event_name == "chat.chunk":
        content = data.get("content")
        if content:
            events.append(("agent.message.delta", {"delta": content, "raw": data}))
        return events

    if event_name == "chat.tool_progress":
        tool = str(data.get("name") or data.get("tool") or "tool")
        label = str(data.get("label") or tool)
        events.append(("tool.started", {"tool": tool, "label": label}))
        events.append(("tool.progress", {"tool": tool, "label": label}))
        return events

    if event_name == "chat.usage":
        events.append(("run.usage_json", {"usage": data}))
        return events

    if event_name in {"chat.done", "agent.message.completed"}:
        events.append(("agent.message.completed", data))
        return events

    if event_name in {"chat.error", "error"}:
        message = str(data.get("message") or "hermes_error")
        events.append(("task.failed", {"message": message, "details": data}))
        return events

    if event_name.startswith("hermes.tool."):
        mapped = event_name.replace("hermes.", "tool.", 1)
        events.append((mapped, data))
        return events

    # OpenAI-style raw SSE without event name
    if not event_name and "choices" in data:
        choice = data.get("choices", [{}])[0]
        delta = choice.get("delta", {}) if isinstance(choice, dict) else {}
        content = delta.get("content") if isinstance(delta, dict) else None
        if content:
            events.append(("agent.message.delta", {"delta": content}))
        usage = data.get("usage")
        if isinstance(usage, dict):
            events.append(("run.usage_json", {"usage": usage}))
        return events

    if event_name:
        events.append((event_name, data))
    return events


def parse_sse_block(block: str) -> tuple[str, dict[str, Any]]:
    event_type = ""
    data_line = ""
    for line in block.split("\n"):
        if line.startswith("event: "):
            event_type = line[7:].strip()
        elif line.startswith("data: "):
            data_line = line[6:]
    if not data_line:
        return event_type, {}
    if data_line == "[DONE]":
        return "chat.done", {}
    try:
        parsed = json.loads(data_line)
        return event_type, parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return event_type, {"raw": data_line}
