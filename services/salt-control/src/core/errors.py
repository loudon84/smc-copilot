from __future__ import annotations

from enum import StrEnum


class ErrorCode(StrEnum):
    ENROLLMENT_TOKEN_INVALID = "enrollment_token_invalid"
    ENROLLMENT_TOKEN_EXPIRED = "enrollment_token_expired"
    ENROLLMENT_TOKEN_REPLAYED = "enrollment_token_replayed"
    ENDPOINT_IDENTITY_CONFLICT = "endpoint_identity_conflict"
    MINION_KEY_MISSING = "minion_key_missing"
    MINION_FINGERPRINT_MISMATCH = "minion_fingerprint_mismatch"
    MASTER_ACCEPT_FAILED = "master_accept_failed"
    SYNC_ALL_FAILED = "sync_all_failed"
    HIGHSTATE_FAILED = "highstate_failed"
    BINDING_MISSING = "binding_missing"
    DESIRED_STATE_UNAVAILABLE = "desired_state_unavailable"
    SECRET_FORBIDDEN = "secret_forbidden"
    ARTIFACT_NOT_FOUND = "artifact_not_found"
    ARTIFACT_SIGNATURE_INVALID = "artifact_signature_invalid"
    ROLLOUT_GATE_FAILED = "rollout_gate_failed"
    SALT_JID_CONFLICT = "salt_jid_conflict"
    JOB_NOT_CLAIMABLE = "job_not_claimable"
    JOB_NOT_FOUND = "job_not_found"
    MASTER_UNAVAILABLE = "master_unavailable"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"


class SaltControlError(Exception):
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


def error_body(exc: SaltControlError) -> dict:
    return {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
        }
    }
