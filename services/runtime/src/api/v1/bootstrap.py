from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.bootstrap import BootstrapAcceptedResponse, BootstrapConfigRequest, BootstrapJobResponse
from schemas.runtime import RuntimeJobAcceptedResponse
from services.bootstrap_service import BootstrapService
from services.runtime_job_service import RuntimeJobService

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


def get_runtime_job_service(request: Request) -> RuntimeJobService:
    return request.app.state.runtime_job_service


@router.post("", response_model=BootstrapAcceptedResponse)
async def bootstrap_submit(
    body: BootstrapConfigRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> BootstrapAcceptedResponse:
    service = BootstrapService(settings, session)
    service.validate_config(body)
    bootstrap_session_id = getattr(request.state, "bootstrap_session_id", None)
    if bootstrap_session_id:
        await service.assert_bootstrap_session_active(bootstrap_session_id)

    accepted: RuntimeJobAcceptedResponse = await jobs.create_job(
        "bootstrap",
        {
            "config": body.model_dump(by_alias=True),
            "bootstrapSessionId": bootstrap_session_id,
        },
    )
    return BootstrapAcceptedResponse(jobId=accepted.job_id, status=accepted.status)


@router.get("/jobs/{job_id}", response_model=BootstrapJobResponse)
async def bootstrap_job_status(
    job_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> BootstrapJobResponse:
    return await BootstrapService(settings, session).get_job(job_id)
