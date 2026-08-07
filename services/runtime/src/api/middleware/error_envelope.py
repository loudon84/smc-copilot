from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from core.errors import ChatApiError, CopilotError
from core.runtime_errors import ERROR_HTTP_STATUS, RuntimeServiceError

REQUEST_ID_HEADER = "X-Request-ID"


def _request_id_from(request: Request) -> str:
    incoming = request.headers.get(REQUEST_ID_HEADER) or request.headers.get("x-request-id")
    if incoming and incoming.strip():
        return incoming.strip()
    return str(uuid.uuid4())


def _envelope(
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "requestId": request_id or str(uuid.uuid4()),
        }
    }


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Propagate X-Request-ID into request.state and response headers (PRD v1.1 §14.2)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = _request_id_from(request)
        request.state.request_id = rid
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = rid
        return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_middleware(RequestIdMiddleware)

    def _rid(request: Request) -> str:
        return getattr(request.state, "request_id", None) or _request_id_from(request)

    @app.exception_handler(ChatApiError)
    async def chat_api_error_handler(request: Request, exc: ChatApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(
                code=exc.code,
                message=exc.message,
                details=exc.details or None,
                request_id=_rid(request),
            ),
            headers={REQUEST_ID_HEADER: _rid(request)},
        )

    @app.exception_handler(RuntimeServiceError)
    async def runtime_error_handler(request: Request, exc: RuntimeServiceError) -> JSONResponse:
        rid = exc.request_id or _rid(request)
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(
                code=exc.code,
                message=exc.message,
                details=exc.details or None,
                request_id=rid,
            ),
            headers={REQUEST_ID_HEADER: rid},
        )

    @app.exception_handler(CopilotError)
    async def copilot_error_handler(request: Request, exc: CopilotError) -> JSONResponse:
        status_code = ERROR_HTTP_STATUS.get(exc.code, 400)
        rid = _rid(request)
        return JSONResponse(
            status_code=status_code,
            content=_envelope(code=exc.code, message=exc.message, request_id=rid),
            headers={REQUEST_ID_HEADER: rid},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        rid = _rid(request)
        return JSONResponse(
            status_code=422,
            content=_envelope(
                code="validation_error",
                message="Request validation failed",
                details={"errors": exc.errors()},
                request_id=rid,
            ),
            headers={REQUEST_ID_HEADER: rid},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        rid = _rid(request)
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            return JSONResponse(
                status_code=exc.status_code,
                content=detail,
                headers={REQUEST_ID_HEADER: rid},
            )
        message = detail if isinstance(detail, str) else str(detail)
        code = "http_error" if exc.status_code >= 500 else "request_error"
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code=code, message=message, request_id=rid),
            headers={REQUEST_ID_HEADER: rid},
        )
