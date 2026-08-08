from __future__ import annotations

import json
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from schemas.runtime import (
    RuntimeCapabilitiesResponse,
    RuntimeCompatibilityResponse,
    RuntimeInstallRequest,
    RuntimeJobAcceptedResponse,
    RuntimeJobCreateRequest,
    RuntimeJobResponse,
    RuntimeReadinessResponse,
    RuntimeRollbackRequest,
    RuntimeStatusResponse,
    RuntimeUpdatePlanRequest,
    RuntimeUpdatePlanResponse,
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
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeStatusResponse:
    return await RuntimeStatusService(settings, session, app_state=request.app.state).status()


@router.get("/readiness", response_model=RuntimeReadinessResponse)
async def runtime_readiness(
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> RuntimeReadinessResponse:
    """PRD v1.4 domain readiness (service / execution / maintenance / expertMcp)."""
    return await RuntimeStatusService(settings, session, app_state=request.app.state).readiness_v2()


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


@router.post("/update/plan", response_model=RuntimeUpdatePlanResponse)
async def runtime_update_plan(
    body: RuntimeUpdatePlanRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
) -> RuntimeUpdatePlanResponse:
    from services.runtime_update_plan_service import RuntimeUpdatePlanService

    session_maker = request.app.state.session_maker
    service = RuntimeUpdatePlanService(settings, session_maker)
    result = await service.create_plan(
        version=body.version,
        channel=body.channel,
        instance_ids=body.instance_ids,
        strategy=body.strategy,
    )
    return RuntimeUpdatePlanResponse(
        planId=result.get("planId"),
        fromVersion=result.get("fromVersion"),
        toVersion=result["toVersion"],
        affectedInstances=result.get("affectedInstances") or [],
        compatibility=result["compatibility"],
        warnings=result.get("warnings") or [],
    )


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

    def _meta(raw: str | None) -> dict | None:
        if not raw:
            return None
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None

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
            metadata=_meta(r.metadata_json),
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
    metadata = None
    if row.metadata_json:
        try:
            parsed = json.loads(row.metadata_json)
            metadata = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            metadata = None
    return RuntimeVersionResponse(
        id=row.id,
        version=row.version,
        channel=row.channel,
        installPath=row.install_path,
        executablePath=row.executable_path,
        pythonPath=row.python_path,
        checksum=row.checksum,
        status=row.status,
        metadata=metadata,
        installedAt=row.installed_at,
        activatedAt=row.activated_at,
    )


@router.delete("/versions/{version}")
async def delete_runtime_version(
    version: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    from db.repositories.runtime_repo import RuntimeVersionRepository
    from services.runtime_version_pin_service import RuntimeVersionPinService

    repo = RuntimeVersionRepository(session)
    row = await repo.get_by_version(version)
    if row is None:
        raise RuntimeServiceError(f"Version not found: {version}", code="not_found")
    await RuntimeVersionPinService(session).assert_deletable(row)
    path = Path(row.install_path)
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
    await repo.delete(row)
    await session.commit()
    return {"status": "deleted", "version": version}
