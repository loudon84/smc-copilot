from __future__ import annotations

from fastapi import APIRouter, Request

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from schemas.job import JobCreateRequest, JobResponse

router = APIRouter(prefix="/migrations", tags=["migrations"])


@router.post("/handover", response_model=JobResponse)
async def handover(
    body: JobCreateRequest, request: Request, services: RequestServicesDep, _auth: OperatorAuth
) -> JobResponse:
    payload = body.model_copy(update={"operation": "handover"})
    response = await services.handover_service.handover(
        endpoint_id=payload.endpoint_id,
        minion_id=payload.minion_id,
        idempotency_key=payload.idempotency_key,
        requested_by=payload.requested_by,
        config_revision=payload.config_revision,
        release_id=payload.release_id,
        correlation_id=payload.correlation_id,
    )
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None and not response.duplicate:
        worker.notify()
    return response


@router.post("/rollback", response_model=JobResponse)
async def rollback(
    body: JobCreateRequest, request: Request, services: RequestServicesDep, _auth: OperatorAuth
) -> JobResponse:
    response = await services.handover_service.rollback(
        endpoint_id=body.endpoint_id,
        minion_id=body.minion_id,
        idempotency_key=body.idempotency_key,
        requested_by=body.requested_by,
        config_revision=body.config_revision,
        release_id=body.release_id,
        correlation_id=body.correlation_id,
    )
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None and not response.duplicate:
        worker.notify()
    return response


@router.post("/remigrate", response_model=JobResponse)
async def remigrate(
    body: JobCreateRequest, request: Request, services: RequestServicesDep, _auth: OperatorAuth
) -> JobResponse:
    response = await services.handover_service.remigrate(
        endpoint_id=body.endpoint_id,
        minion_id=body.minion_id,
        idempotency_key=body.idempotency_key,
        requested_by=body.requested_by,
        config_revision=body.config_revision,
        release_id=body.release_id,
        correlation_id=body.correlation_id,
    )
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None and not response.duplicate:
        worker.notify()
    return response
