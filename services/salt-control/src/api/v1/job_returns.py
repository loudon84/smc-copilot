from __future__ import annotations

from fastapi import APIRouter, Request

from core.auth import DeviceAuth
from schemas.job_return import JobReturnBatchRequest, JobReturnBatchResponse

router = APIRouter(tags=["job-returns"])


@router.post("/job-returns:batch", response_model=JobReturnBatchResponse)
async def batch_job_returns(
    body: JobReturnBatchRequest,
    request: Request,
    _auth: DeviceAuth,
) -> JobReturnBatchResponse:
    return await request.app.state.return_service.batch_upsert(body)
