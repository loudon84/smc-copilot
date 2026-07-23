from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.runtime import (
    RuntimeCapabilitiesResponse,
    RuntimeCompatibilityResponse,
    RuntimeInstallRequest,
    RuntimeJobAcceptedResponse,
    RuntimeJobCreateRequest,
    RuntimeJobResponse,
    RuntimeRollbackRequest,
    RuntimeStatusResponse,
    RuntimeUpdateRequest,
    RuntimeVersionResponse,
)
from services.runtime_job_service import RuntimeJobService
from services.runtime_status_service import RuntimeStatusService

router = APIRouter(prefix="/runtime", tags=["runtime"])


def get_runtime_job_service(request: Request) -> RuntimeJobService:
    return request.app.state.runtime_job_service


@router.get("/status", response_model=RuntimeStatusResponse)
async def runtime_status(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeStatusResponse:
    return await RuntimeStatusService(settings, session).status()


@router.get("/capabilities", response_model=RuntimeCapabilitiesResponse)
async def runtime_capabilities(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeCapabilitiesResponse:
    return RuntimeStatusService(settings, session).capabilities()


@router.get("/compatibility", response_model=RuntimeCompatibilityResponse)
async def runtime_compatibility(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeCompatibilityResponse:
    return RuntimeStatusService(settings, session).compatibility()


@router.post("/install", response_model=RuntimeJobAcceptedResponse)
async def runtime_install(
    body: RuntimeInstallRequest,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobAcceptedResponse:
    payload = body.model_dump(by_alias=True, exclude_none=True)
    return await jobs.create_job("install", payload)


@router.post("/update", response_model=RuntimeJobAcceptedResponse)
async def runtime_update(
    body: RuntimeUpdateRequest,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobAcceptedResponse:
    payload = body.model_dump(by_alias=True, exclude_none=True)
    return await jobs.create_job("update", payload)


@router.post("/rollback", response_model=RuntimeJobAcceptedResponse)
async def runtime_rollback(
    body: RuntimeRollbackRequest,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobAcceptedResponse:
    payload = body.model_dump(by_alias=True, exclude_none=True)
    return await jobs.create_job("rollback", payload)


@router.post("/doctor", response_model=RuntimeJobAcceptedResponse)
async def runtime_doctor(
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobAcceptedResponse:
    return await jobs.create_job("doctor", {})


@router.post("/jobs", response_model=RuntimeJobAcceptedResponse)
async def create_runtime_job(
    body: RuntimeJobCreateRequest,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobAcceptedResponse:
    return await jobs.create_job(body.job_type, body.request)


@router.get("/jobs", response_model=list[RuntimeJobResponse])
async def list_runtime_jobs(
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> list[RuntimeJobResponse]:
    return await jobs.list_jobs()


@router.get("/jobs/{job_id}", response_model=RuntimeJobResponse)
async def get_runtime_job(
    job_id: str,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobResponse:
    return await jobs.get_job(job_id)


@router.post("/jobs/{job_id}/cancel", response_model=RuntimeJobResponse)
async def cancel_runtime_job(
    job_id: str,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> RuntimeJobResponse:
    return await jobs.cancel_job(job_id)


@router.get("/jobs/{job_id}/events")
async def runtime_job_events(
    job_id: str,
    jobs: RuntimeJobService = Depends(get_runtime_job_service),
) -> StreamingResponse:
    async def gen():
        async for event in jobs.iter_events(job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/versions", response_model=list[RuntimeVersionResponse])
async def list_runtime_versions(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[RuntimeVersionResponse]:
    from db.repositories.runtime_repo import RuntimeVersionRepository

    rows = await RuntimeVersionRepository(session).list_all()
    return [
        RuntimeVersionResponse(
            id=r.id,
            version=r.version,
            channel=r.channel,
            installPath=r.install_path,
            executablePath=r.executable_path,
            pythonPath=r.python_path,
            checksum=r.checksum,
            status=r.status,
            installedAt=r.installed_at,
            activatedAt=r.activated_at,
        )
        for r in rows
    ]


@router.get("/versions/{version}", response_model=RuntimeVersionResponse)
async def get_runtime_version(
    version: str,
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeVersionResponse:
    from core.runtime_errors import RuntimeServiceError
    from db.repositories.runtime_repo import RuntimeVersionRepository

    row = await RuntimeVersionRepository(session).get_by_version(version)
    if row is None:
        raise RuntimeServiceError(f"Version not found: {version}", code="not_found")
    return RuntimeVersionResponse(
        id=row.id,
        version=row.version,
        channel=row.channel,
        installPath=row.install_path,
        executablePath=row.executable_path,
        pythonPath=row.python_path,
        checksum=row.checksum,
        status=row.status,
        installedAt=row.installed_at,
        activatedAt=row.activated_at,
    )


@router.delete("/versions/{version}")
async def delete_runtime_version(
    version: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    from core.runtime_enums import RuntimeVersionStatus
    from core.runtime_errors import RuntimeServiceError
    from db.repositories.runtime_repo import RuntimeVersionRepository
    from sqlalchemy import select
    from db.models.runtime import HermesInstance

    repo = RuntimeVersionRepository(session)
    row = await repo.get_by_version(version)
    if row is None:
        raise RuntimeServiceError(f"Version not found: {version}", code="not_found")
    if row.status == RuntimeVersionStatus.ACTIVE.value:
        raise RuntimeServiceError("Cannot delete active version", code="invalid_state")
    pinned = await session.execute(
        select(HermesInstance).where(HermesInstance.runtime_version_id == row.id).limit(1)
    )
    if pinned.scalar_one_or_none() is not None:
        raise RuntimeServiceError("Version is pinned by an instance", code="invalid_state")
    await repo.delete(row)
    return {"status": "deleted", "version": version}
