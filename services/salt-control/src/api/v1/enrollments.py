from __future__ import annotations

from fastapi import APIRouter, Request

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
async def create_enrollment(body: EnrollmentCreateRequest, request: Request) -> EnrollmentCreateResponse:
    return await request.app.state.enrollment_service.create(body)


@router.post("/{enrollment_id}/fingerprint", response_model=FingerprintReportResponse)
async def report_fingerprint(
    enrollment_id: str,
    body: FingerprintReportRequest,
    request: Request,
    _auth: DeviceAuth,
) -> FingerprintReportResponse:
    return await request.app.state.enrollment_service.report_fingerprint(enrollment_id, body)


@router.get("/{enrollment_id}", response_model=EnrollmentStatusResponse)
async def get_enrollment(
    enrollment_id: str,
    request: Request,
    _auth: DeviceAuth,
) -> EnrollmentStatusResponse:
    return await request.app.state.enrollment_service.get_status(enrollment_id)
