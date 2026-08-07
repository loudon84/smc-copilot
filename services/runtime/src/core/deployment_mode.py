"""Deployment mode validation (PRD v1.6 FR-101)."""

from __future__ import annotations

from enum import StrEnum

from core.config import Settings
from core.errors import CopilotError


class DeploymentMode(StrEnum):
    DEVELOPMENT_STUB = "development_stub"
    STAGING_HTTP = "staging_http"
    PRODUCTION_HTTP = "production_http"


class DeploymentModeError(CopilotError):
    def __init__(self, message: str, *, code: str = "deployment_mode_invalid") -> None:
        super().__init__(message, code=code)


def parse_deployment_mode(value: str | None) -> DeploymentMode:
    raw = (value or DeploymentMode.DEVELOPMENT_STUB.value).strip().lower()
    try:
        return DeploymentMode(raw)
    except ValueError as exc:
        raise DeploymentModeError(f"unknown deployment mode: {value}") from exc


def validate_deployment_mode(settings: Settings) -> DeploymentMode:
    mode = parse_deployment_mode(getattr(settings, "deployment_mode", None))
    use_stub = bool(settings.service_center_use_stub)
    base = (settings.service_center_base_url or "").strip()
    allowlist = (settings.service_center_domain_allowlist or "").strip()
    manifest_keys = (settings.runtime_manifest_public_keys_json or "").strip()

    if mode == DeploymentMode.DEVELOPMENT_STUB:
        return mode

    if use_stub:
        raise DeploymentModeError(
            f"{mode.value} forbids Stub Service Center client",
            code="stub_forbidden",
        )

    if not base:
        raise DeploymentModeError("Service Center base URL required", code="center_url_required")
    if not base.lower().startswith("https://"):
        raise DeploymentModeError("Service Center base URL must be HTTPS", code="center_url_insecure")

    if mode == DeploymentMode.STAGING_HTTP:
        return mode

    # production_http hard gates
    if not allowlist:
        raise DeploymentModeError("domain allowlist required in production", code="allowlist_required")
    if not manifest_keys:
        raise DeploymentModeError("manifest public keys required in production", code="manifest_keys_required")
    if settings.runtime_allow_legacy_token:
        raise DeploymentModeError("legacy token must be disabled in production", code="legacy_token_forbidden")
    if not settings.require_auth():
        raise DeploymentModeError("runtime auth required in production", code="auth_required")
    return mode
