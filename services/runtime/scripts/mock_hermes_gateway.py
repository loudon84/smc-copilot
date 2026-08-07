"""Minimal Hermes Gateway mock for local dev and L2 Fake Hermes tests (PRD v1.2 §20).

Simulates:
  - message delta streaming (OpenAI-style SSE chunks)
  - usage events
  - tool progress (event: hermes.tool.progress)
  - session id header x-hermes-session-id
  - abort mid-stream (client disconnect / CancelledError)
  - optional provider failure via ?fail=1 or header X-Mock-Hermes-Fail: 1
  - optional slow stream via ?slow_ms=N or X-Mock-Hermes-Slow-Ms
  - optional clarify / approval via ?mode=clarify|approval

Run: uv run python scripts/mock_hermes_gateway.py --port 18642
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from typing import Any

import uvicorn
from fastapi import FastAPI, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="mock-hermes-gateway")
_runs: dict[str, dict[str, Any]] = {}


class RunBody(BaseModel):
    model: str | None = None
    input: str | dict[str, Any] | list[Any] = ""
    metadata: dict[str, Any] | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/models")
def list_models() -> dict[str, list[dict[str, str]]]:
    return {"data": [{"id": "mock-model", "object": "model"}]}


@app.post("/v1/runs")
def create_run(body: RunBody) -> dict[str, Any]:
    run_id = str(uuid.uuid4())
    record = {"id": run_id, "status": "completed", "model": body.model, "input": body.input}
    _runs[run_id] = record
    return record


@app.get("/v1/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    return _runs.get(run_id, {"id": run_id, "status": "unknown"})


@app.get("/v1/runs/{run_id}/events")
def run_events(run_id: str) -> dict[str, list[dict[str, str]]]:
    return {"data": [{"type": "message", "run_id": run_id, "content": "mock event"}]}


@app.post("/v1/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict[str, str]:
    if run_id in _runs:
        _runs[run_id]["status"] = "cancelled"
    return {"status": "ok"}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionBody(BaseModel):
    model: str | None = None
    messages: list[ChatMessage] = []
    stream: bool = False


def _truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in ("1", "true", "yes", "on")


def _sse_data(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


async def _stream_chat(
    *,
    fail: bool,
    slow_ms: int,
    mode: str,
    request: Request,
):
    """Yield SSE chunks; stop early if client disconnects (abort mid-stream)."""
    if fail:
        yield _sse_data(
            {
                "error": {
                    "message": "mock provider failure",
                    "type": "provider_error",
                    "code": "MOCK_PROVIDER_FAIL",
                }
            }
        )
        yield "data: [DONE]\n\n"
        return

    if mode == "clarify":
        yield _sse_event(
            "hermes.clarify",
            {"requestId": "mock-clarify-1", "prompt": "Need more detail?"},
        )
        yield "data: [DONE]\n\n"
        return

    if mode == "approval":
        yield _sse_event(
            "hermes.tool.progress",
            {
                "tool": "shell",
                "name": "shell",
                "label": "shell",
                "status": "started",
                "call_id": "call_mock_1",
            },
        )
        yield _sse_data(
            {
                "choices": [
                    {
                        "delta": {},
                        "finish_reason": None,
                    }
                ],
                "hermes": {"approval_requested": True, "callId": "call_mock_1"},
            }
        )
        # Surface as tool progress waiting; durable mapper treats progress statuses.
        yield _sse_event(
            "hermes.tool.progress",
            {
                "tool": "shell",
                "name": "shell",
                "label": "shell",
                "status": "progress",
                "call_id": "call_mock_1",
            },
        )
        yield "data: [DONE]\n\n"
        return

    # Tool progress lifecycle
    yield _sse_event(
        "hermes.tool.progress",
        {
            "tool": "web_search",
            "name": "web_search",
            "label": "web_search",
            "status": "started",
            "call_id": "call_search_1",
        },
    )
    if await request.is_disconnected():
        return
    if slow_ms > 0:
        await asyncio.sleep(slow_ms / 1000.0)

    yield _sse_event(
        "hermes.tool.progress",
        {
            "tool": "web_search",
            "name": "web_search",
            "label": "web_search",
            "status": "completed",
            "call_id": "call_search_1",
        },
    )

    chunks = ["mock ", "stream ", "reply"]
    for piece in chunks:
        if await request.is_disconnected():
            return
        if slow_ms > 0:
            await asyncio.sleep(slow_ms / 1000.0)
        yield _sse_data({"choices": [{"delta": {"content": piece}}]})

    usage = {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}
    yield _sse_data({"usage": usage})
    yield "data: [DONE]\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(
    body: ChatCompletionBody,
    request: Request,
    fail: str | None = Query(default=None),
    slow_ms: int = Query(default=0),
    mode: str = Query(default=""),
    x_mock_hermes_fail: str | None = Header(default=None),
    x_mock_hermes_slow_ms: str | None = Header(default=None),
    x_mock_hermes_mode: str | None = Header(default=None),
):
    want_fail = _truthy(fail) or _truthy(x_mock_hermes_fail)
    effective_slow = slow_ms
    if x_mock_hermes_slow_ms and x_mock_hermes_slow_ms.strip().isdigit():
        effective_slow = int(x_mock_hermes_slow_ms.strip())
    effective_mode = (mode or x_mock_hermes_mode or "").strip().lower()

    if not body.stream:
        if want_fail:
            return JSONResponse(
                status_code=502,
                content={"error": {"message": "mock provider failure", "code": "MOCK_PROVIDER_FAIL"}},
            )
        return {
            "choices": [{"message": {"role": "assistant", "content": "mock reply"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
        }

    session_header = f"session_mock_{uuid.uuid4().hex[:12]}"

    async def generate():
        try:
            async for chunk in _stream_chat(
                fail=want_fail,
                slow_ms=max(0, effective_slow),
                mode=effective_mode,
                request=request,
            ):
                yield chunk
        except asyncio.CancelledError:
            # Client abort mid-stream
            return

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"x-hermes-session-id": session_header, "Cache-Control": "no-cache"},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Fake Hermes Gateway (L2)")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--profile", type=str, default="default")
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
