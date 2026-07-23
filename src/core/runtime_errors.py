from __future__ import annotations

from typing import Any

from core.errors import CopilotError


# HTTP status mapping for unified API error envelope (PRD §14)
ERROR_HTTP_STATUS: dict[str, int] = {
    "validation_error": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
    "invalid_state": 409,
    "runtime_job_failed": 422,
    "gateway_unavailable": 503,
    "hermes_client_error": 502,
    "internal_error": 500,
    # legacy / domain codes
    "gateway_error": 503,
    "policy_denied": 403,
    "invalid_state_transition": 409,
    "team_hub_error": 502,
    "runtime_lock_conflict": 409,
    "unsupported_platform": 400,
    "unsupported_architecture": 400,
    "insufficient_disk_space": 422,
    "network_unavailable": 503,
    "manifest_invalid": 422,
    "artifact_download_failed": 422,
    "checksum_mismatch": 422,
    "python_runtime_failed": 422,
    "hermes_install_failed": 422,
    "config_migrate_failed": 422,
    "doctor_failed": 422,
    "activation_failed": 422,
    "gateway_health_failed": 503,
}


class RuntimeServiceError(CopilotError):
    """Runtime Service domain error with optional details and request id."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "internal_error",
        details: dict[str, Any] | None = None,
        request_id: str | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message, code=code)
        self.details = details or {}
        self.request_id = request_id
        self.http_status = http_status or ERROR_HTTP_STATUS.get(code, 500)


def runtime_lock_conflict(job_id: str) -> RuntimeServiceError:
    return RuntimeServiceError(
        "Another runtime job is running",
        code="runtime_lock_conflict",
        details={"jobId": job_id},
    )
