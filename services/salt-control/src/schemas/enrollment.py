from __future__ import annotations

from schemas.common import CamelModel


class DeviceInfo(CamelModel):
    hostname: str
    machine_guid_hash: str
    windows_build: int
    arch: str


class EnrollmentCreateRequest(CamelModel):
    enrollment_token: str
    request_id: str
    device: DeviceInfo


class EnrollmentCreateResponse(CamelModel):
    enrollment_id: str
    endpoint_id: str
    masters: list[str]
    master_fingerprints: list[str]
    device_credential: str
    expires_at: str


class FingerprintReportRequest(CamelModel):
    endpoint_id: str
    minion_fingerprint: str
    request_id: str


class FingerprintReportResponse(CamelModel):
    enrollment_id: str
    endpoint_id: str
    state: str
    error_code: str | None = None


class EnrollmentStatusResponse(CamelModel):
    enrollment_id: str
    endpoint_id: str
    state: str
    error_code: str | None = None
    masters: list[str]
    master_fingerprints: list[str]
