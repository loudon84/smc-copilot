from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from core.errors import ChatApiError, CopilotError
from core.runtime_errors import ERROR_HTTP_STATUS, RuntimeServiceError


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


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ChatApiError)
    async def chat_api_error_handler(_request: Request, exc: ChatApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(code=exc.code, message=exc.message, details=exc.details or None),
        )

    @app.exception_handler(RuntimeServiceError)
    async def runtime_error_handler(_request: Request, exc: RuntimeServiceError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(
                code=exc.code,
                message=exc.message,
                details=exc.details or None,
                request_id=exc.request_id,
            ),
        )

    @app.exception_handler(CopilotError)
    async def copilot_error_handler(_request: Request, exc: CopilotError) -> JSONResponse:
        status_code = ERROR_HTTP_STATUS.get(exc.code, 400)
        return JSONResponse(
            status_code=status_code,
            content=_envelope(code=exc.code, message=exc.message),
        )
