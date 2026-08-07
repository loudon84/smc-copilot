"""Unit tests for parse_hermes_sse_block (PRD v1.2 Phase 7 — no live gateway)."""

from __future__ import annotations

import json

from services.hermes_chat_event_mapper import parse_hermes_sse_block


def test_parse_message_delta_block() -> None:
    block = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n'
    events = parse_hermes_sse_block(block)
    assert len(events) == 1
    assert events[0].type == "message_delta"
    assert events[0].payload["content"] == "Hello"
    assert events[0].payload["text"] == "Hello"


def test_parse_usage_block() -> None:
    block = 'data: {"usage":{"prompt_tokens":3,"completion_tokens":5,"total_tokens":8}}\n'
    events = parse_hermes_sse_block(block)
    assert len(events) == 1
    assert events[0].type == "usage"
    assert events[0].payload == {
        "promptTokens": 3,
        "completionTokens": 5,
        "totalTokens": 8,
    }


def test_parse_tool_progress_started_completed_failed() -> None:
    started = parse_hermes_sse_block(
        'event: hermes.tool.progress\ndata: {"tool":"shell","status":"started","call_id":"c1"}\n'
    )
    assert started[0].type == "tool_started"
    assert started[0].payload["callId"] == "c1"

    done = parse_hermes_sse_block(
        'event: hermes.tool.progress\ndata: {"name":"shell","status":"completed","id":"c1"}\n'
    )
    assert done[0].type == "tool_completed"

    failed = parse_hermes_sse_block(
        'event: hermes.tool.progress\ndata: {"tool":"shell","status":"failed","call_id":"c1"}\n'
    )
    assert failed[0].type == "tool_failed"

    progress = parse_hermes_sse_block(
        'event: hermes.tool.progress\ndata: {"tool":"shell","status":"running","call_id":"c1"}\n'
    )
    assert progress[0].type == "tool_progress"


def test_parse_provider_error() -> None:
    block = 'data: {"error":{"message":"upstream down"}}\n'
    events = parse_hermes_sse_block(block)
    assert events[0].type == "failed"
    assert events[0].payload["errorCode"] == "PROVIDER_ERROR"
    assert "upstream down" in events[0].payload["message"]


def test_parse_done_and_empty() -> None:
    assert parse_hermes_sse_block("data: [DONE]\n") == []
    assert parse_hermes_sse_block("event: ping\n") == []


def test_parse_reasoning_delta() -> None:
    block = 'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n'
    events = parse_hermes_sse_block(block)
    assert events[0].type == "reasoning_delta"
    assert events[0].payload["content"] == "think"


def test_parse_clarify_event() -> None:
    payload = {"requestId": "r1", "prompt": "clarify?"}
    block = f"event: hermes.clarify\ndata: {json.dumps(payload)}\n"
    events = parse_hermes_sse_block(block)
    assert events[0].type == "clarify_requested"
    assert events[0].payload["requestId"] == "r1"


def test_parse_usage_and_delta_same_block() -> None:
    block = (
        'data: {"choices":[{"delta":{"content":"x"}}],'
        '"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n'
    )
    types = [e.type for e in parse_hermes_sse_block(block)]
    assert "usage" in types
    assert "message_delta" in types
