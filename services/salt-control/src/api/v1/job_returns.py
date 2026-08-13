from __future__ import annotations

from fastapi import APIRouter

from api.deps import RequestServicesDep
from core.auth import DeviceAuth
from schemas.job_return import JobReturnBatchRequest, JobReturnBatchResponse

router = APIRouter(tags=["job-returns"])


@router.post("/job-returns:batch", response_model=JobReturnBatchResponse)
async def batch_job_returns(
    body: JobReturnBatchRequest,
    services: RequestServicesDep,
    auth: DeviceAuth,
) -> JobReturnBatchResponse:
    return await services.return_service.batch_upsert(body, auth_endpoint_id=auth.endpoint_id)
