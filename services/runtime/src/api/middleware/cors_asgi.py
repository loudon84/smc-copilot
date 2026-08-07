from __future__ import annotations

from urllib.parse import urlparse

from starlette.types import ASGIApp, Message, Receive, Scope, Send

CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
CORS_ALLOW_HEADERS = "Content-Type, Authorization, X-Copilot-Desktop-Token, Last-Event-ID, Accept"
CORS_EXPOSE_HEADERS = "Content-Type"


def _parse_origin_url(value: str) -> tuple[str | None, int | None]:
    raw = value.strip()
    if not raw:
        return None, None
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    return parsed.hostname, parsed.port


def _origin_is_allowed(origin: str, allowed: list[str]) -> bool:
    if origin in allowed:
        return True
    req_host, req_port = _parse_origin_url(origin)
    if not req_host:
        return False
    for entry in allowed:
        if origin == entry:
            return True
        allow_host, allow_port = _parse_origin_url(entry)
        if allow_host != req_host:
            continue
        # http://127.0.0.1 / http://localhost → 允许任意端口（electron-vite :5173 等）
        if allow_port is None:
            return True
        if allow_port == req_port:
            return True
    return False


def _resolve_allow_origin(origin: str | None, allowed: list[str]) -> str | None:
    if origin and _origin_is_allowed(origin, allowed):
        return origin
    if not origin:
        return allowed[0] if allowed else "http://127.0.0.1"
    return None


class PureAsgiCorsMiddleware:
    """Pure ASGI CORS — does not buffer StreamingResponse bodies."""

    def __init__(self, app: ASGIApp, *, allow_origins: list[str]) -> None:
        self.app = app
        self.allow_origins = allow_origins

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        origin = headers.get(b"origin", b"").decode() or None
        allow_origin = _resolve_allow_origin(origin, self.allow_origins)
        method = scope.get("method", "GET")

        if method == "OPTIONS":
            if allow_origin:
                await self._send_options(send, allow_origin)
            else:
                await send({"type": "http.response.start", "status": 403, "headers": []})
                await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start" and allow_origin:
                hdrs = list(message.get("headers") or [])
                hdrs.extend(
                    [
                        (b"access-control-allow-origin", allow_origin.encode()),
                        (b"access-control-allow-credentials", b"true"),
                        (b"access-control-expose-headers", CORS_EXPOSE_HEADERS.encode()),
                    ]
                )
                message = {**message, "headers": hdrs}
            await send(message)

        await self.app(scope, receive, send_with_cors)

    async def _send_options(self, send: Send, allow_origin: str) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 204,
                "headers": [
                    (b"access-control-allow-origin", allow_origin.encode()),
                    (b"access-control-allow-credentials", b"true"),
                    (b"access-control-allow-methods", CORS_ALLOW_METHODS.encode()),
                    (b"access-control-allow-headers", CORS_ALLOW_HEADERS.encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": b"", "more_body": False})
