from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

from starlette.requests import Request

if TYPE_CHECKING:
    from fastapi.responses import StreamingResponse


def build_stream_request(path: str) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }
    request = Request(scope)

    async def _not_disconnected() -> bool:
        return False

    request.is_disconnected = _not_disconnected  # type: ignore[method-assign]
    return request


async def read_streaming_response(
    response: StreamingResponse,
    *,
    must_contain: str | None = None,
    timeout_sec: float = 5.0,
) -> str:
    """Consume StreamingResponse.body_iterator (httpx ASGI cannot stream infinite SSE)."""
    chunks: list[str] = []
    deadline = time.monotonic() + timeout_sec

    async def _collect() -> str:
        async for part in response.body_iterator:
            text = part.decode() if isinstance(part, bytes) else str(part)
            chunks.append(text)
            joined = "".join(chunks)
            if must_contain and must_contain in joined:
                return joined
            if time.monotonic() > deadline:
                return joined
        return "".join(chunks)

    return await asyncio.wait_for(_collect(), timeout=timeout_sec + 1.0)


async def collect_sse_from_iterator(
    stream: AsyncIterator[str],
    *,
    must_contain: str | None = None,
    timeout_sec: float = 5.0,
) -> str:
    chunks: list[str] = []
    deadline = time.monotonic() + timeout_sec

    async def _collect() -> str:
        try:
            async for part in stream:
                chunks.append(part)
                joined = "".join(chunks)
                if must_contain and must_contain in joined:
                    return joined
                if time.monotonic() > deadline:
                    return joined
            return "".join(chunks)
        finally:
            if hasattr(stream, "aclose"):
                await stream.aclose()

    return await asyncio.wait_for(_collect(), timeout=timeout_sec + 1.0)
