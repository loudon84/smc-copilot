"""Service Center outbound DTOs (PRD §19)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EnrollRequest:
    enrollment_code: str
    public_key_b64: str
    device_id: str
    machine_id_hash: str
    runtime_version: str
    os_version: str
    architecture: str
    user_id: str | None = None
    tenant_hint: str | None = None


@dataclass
class EnrollResponse:
    endpoint_id: str
    tenant_id: str
    access_token: str
    access_token_expires_at: str
    refresh_credential: str
    certificate_thumbprint: str | None = None


@dataclass
class TokenRefreshResponse:
    access_token: str
    access_token_expires_at: str
    refresh_credential: str | None = None


@dataclass
class ChangesResponse:
    items: list[dict[str, Any]] = field(default_factory=list)
    next_cursor: str = ""
    has_more: bool = False


@dataclass
class ClaimResponse:
    lease_id: str
    expires_at: str
    heartbeat_interval_seconds: int = 60


@dataclass
class UploadRequestResponse:
    artifact_id: str
    upload_url: str
    headers: dict[str, str] = field(default_factory=dict)
    expires_at: str | None = None


@dataclass
class ExperienceReviewItem:
    candidate_id: str
    status: str
    detail: dict[str, Any] = field(default_factory=dict)
