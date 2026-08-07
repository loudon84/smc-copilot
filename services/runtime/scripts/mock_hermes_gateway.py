"""Minimal Hermes Gateway mock for local dev and tests."""

from __future__ import annotations

import argparse
import json
import uuid
from typing import Any

import uvicorn
from fastapi import FastAPI
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


@app.post("/v1/chat/completions")
def chat_completions(body: ChatCompletionBody):
    from fastapi.responses import StreamingResponse

    if not body.stream:
        return {
            "choices": [{"message": {"role": "assistant", "content": "mock reply"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
        }

    def generate():
        chunks = ["mock ", "stream ", "reply"]
        for piece in chunks:
            payload = {
                "choices": [{"delta": {"content": piece}}],
            }
            yield f"data: {json.dumps(payload)}\n\n"
        usage = {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
        yield f"data: {json.dumps({'usage': usage})}\n\n"
        yield "data: [DONE]\n\n"

    session_header = f"session_mock_{uuid.uuid4().hex[:12]}"
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"x-hermes-session-id": session_header},
    )

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--profile", type=str, default="default")
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
