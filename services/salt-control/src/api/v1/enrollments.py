from __future__ import annotations

from fastapi import APIRouter, Request, Response

from api.deps import RequestServicesDep
from core.auth import DeviceAuth
from schemas.enrollment import (
    EnrollmentCreateRequest,
    EnrollmentCreateResponse,
    EnrollmentStatusResponse,
    FingerprintReportRequest,
    FingerprintReportResponse,
)

router = APIRouter(prefix="/enrollments", tags=["enrollments"])


@router.post("", response_model=EnrollmentCreateResponse)
async def create_enrollment(body: EnrollmentCreateRequest, services: RequestServicesDep) -> EnrollmentCreateResponse:
    return await services.enrollment_service.create(body)


@router.post("/{enrollment_id}/fingerprint", response_model=FingerprintReportResponse)
async def report_fingerprint(
    enrollment_id: str,
    body: FingerprintReportRequest,
    request: Request,
    services: RequestServicesDep,
    response: Response,
    _auth: DeviceAuth,
) -> FingerprintReportResponse:
    result = await services.enrollment_service.report_fingerprint(enrollment_id, body)
    # Production: accepted + async ops ⇒ 202; lab/test may finish to highstate ⇒ 200.
    if result.state in {"accepted", "synced"} and services.settings.salt_env == "production":
        response.status_code = 202
    return result


@router.get("/{enrollment_id}", response_model=EnrollmentStatusResponse)
async def get_enrollment(
    enrollment_id: str,
    services: RequestServicesDep,
    _auth: DeviceAuth,
) -> EnrollmentStatusResponse:
    return await services.enrollment_service.get_status(enrollment_id)
