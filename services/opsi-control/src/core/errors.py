from __future__ import annotations

from enum import StrEnum


class ErrorCode(StrEnum):
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    VALIDATION_ERROR = "validation_error"
    OPSI_UNAVAILABLE = "opsi_unavailable"
    OPSI_RPC_DENIED = "opsi_rpc_denied"
    ACTION_NOT_CANCELLABLE = "action_not_cancellable"
    PRECONDITION_FAILED = "precondition_failed"
    INTERNAL_ERROR = "internal_error"


class OpsiControlError(Exception):
    def __init__(
        self,
        code: ErrorCode | str,
        message: str,
        *,
        status_code: int = 400,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = str(code)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def error_body(exc: OpsiControlError) -> dict:
    return {"error": {"code": exc.code, "message": exc.message, "details": exc.details}}
