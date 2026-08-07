from __future__ import annotations


class CopilotError(Exception):
    def __init__(self, message: str, *, code: str = "copilot_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="not_found")


class ConflictError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="conflict")


class GatewayError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="gateway_error")


class HermesClientError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="hermes_client_error")


class TeamHubError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="team_hub_error")


class ServiceCenterError(CopilotError):
    def __init__(self, message: str, *, code: str = "service_center_error") -> None:
        super().__init__(message, code=code)


class PolicyError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="policy_denied")


class StateMachineError(CopilotError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="invalid_state_transition")


class ChatApiError(CopilotError):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        details: dict | None = None,
        http_status: int = 400,
    ) -> None:
        super().__init__(message, code=code)
        self.details = details or {}
        self.http_status = http_status


def profile_not_found(message: str = "Profile not found", **details: object) -> ChatApiError:
    return ChatApiError(message, code="PROFILE_NOT_FOUND", details=dict(details), http_status=404)


def instance_not_found(message: str = "Instance not found", **details: object) -> ChatApiError:
    return ChatApiError(message, code="INSTANCE_NOT_FOUND", details=dict(details), http_status=404)


def gateway_not_running(message: str = "Hermes gateway is not running", **details: object) -> ChatApiError:
    return ChatApiError(message, code="GATEWAY_NOT_RUNNING", details=dict(details), http_status=503)


def gateway_health_failed(message: str = "Gateway health check failed", **details: object) -> ChatApiError:
    return ChatApiError(message, code="GATEWAY_HEALTH_FAILED", details=dict(details), http_status=503)


def profile_not_deployed(
    message: str = "Profile is not deployed on this machine",
    **details: object,
) -> ChatApiError:
    return ChatApiError(message, code="PROFILE_NOT_DEPLOYED", details=dict(details), http_status=400)


def model_list_failed(message: str = "Failed to list models", **details: object) -> ChatApiError:
    return ChatApiError(message, code="MODEL_LIST_FAILED", details=dict(details), http_status=502)


def model_config_invalid(message: str = "Invalid model configuration", **details: object) -> ChatApiError:
    return ChatApiError(message, code="MODEL_CONFIG_INVALID", details=dict(details), http_status=400)


def attachment_too_large(message: str = "Attachment too large", **details: object) -> ChatApiError:
    return ChatApiError(message, code="ATTACHMENT_TOO_LARGE", details=dict(details), http_status=400)


def too_many_attachments(message: str = "Too many attachments", **details: object) -> ChatApiError:
    return ChatApiError(message, code="TOO_MANY_ATTACHMENTS", details=dict(details), http_status=400)


def attachment_total_size_exceeded(
    message: str = "Attachment total size exceeded",
    **details: object,
) -> ChatApiError:
    return ChatApiError(
        message, code="ATTACHMENT_TOTAL_SIZE_EXCEEDED", details=dict(details), http_status=400
    )


def attachment_not_found(message: str = "Attachment not found", **details: object) -> ChatApiError:
    return ChatApiError(message, code="ATTACHMENT_NOT_FOUND", details=dict(details), http_status=404)


def attachment_scope_mismatch(message: str = "Attachment scope mismatch", **details: object) -> ChatApiError:
    return ChatApiError(message, code="ATTACHMENT_SCOPE_MISMATCH", details=dict(details), http_status=400)


def workspace_not_found(message: str = "Workspace not found", **details: object) -> ChatApiError:
    return ChatApiError(message, code="WORKSPACE_NOT_FOUND", details=dict(details), http_status=404)


def workspace_path_invalid(message: str = "Workspace path is invalid", **details: object) -> ChatApiError:
    return ChatApiError(message, code="WORKSPACE_PATH_INVALID", details=dict(details), http_status=400)


def chat_stream_failed(message: str = "Chat stream failed", **details: object) -> ChatApiError:
    return ChatApiError(message, code="CHAT_STREAM_FAILED", details=dict(details), http_status=502)


def chat_stream_aborted(message: str = "Chat stream aborted", **details: object) -> ChatApiError:
    return ChatApiError(message, code="CHAT_STREAM_ABORTED", details=dict(details), http_status=400)
