from __future__ import annotations

from fastapi import APIRouter, Request

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from schemas.job import EndpointStatusResponse, JobCreateRequest, JobResponse

router = APIRouter(tags=["jobs"])


@router.post("/jobs", response_model=JobResponse)
async def create_job(
    body: JobCreateRequest,
    request: Request,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> JobResponse:
    # Actor is always the authenticated principal — ignore client-supplied requestedBy.
    payload = body.model_copy(update={"requested_by": auth.subject})
    response = await services.job_service.create(payload)
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None and not response.duplicate:
        worker.notify()
    return response


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, services: RequestServicesDep, _auth: OperatorAuth) -> JobResponse:
    return await services.job_service.get(job_id)


@router.get("/endpoints/{endpoint_id}/status", response_model=EndpointStatusResponse)
async def endpoint_status(
    endpoint_id: str,
    services: RequestServicesDep,
    _auth: OperatorAuth,
) -> EndpointStatusResponse:
    return await services.job_service.endpoint_status(endpoint_id)


@router.get("/observer/stability")
async def observer_stability(request: Request, _auth: OperatorAuth) -> dict:
    observer = getattr(request.app.state, "observer", None)
    if observer is None:
        return {"status": "disabled"}
    return observer.stability_report()


@router.get("/metrics")
async def metrics(request: Request, _auth: OperatorAuth) -> dict:
    observer = getattr(request.app.state, "observer", None)
    job_worker = getattr(request.app.state, "job_worker", None)
    reconciler = getattr(request.app.state, "result_reconciler", None)
    return {
        "observer": observer.metrics if observer is not None else {},
        "jobWorker": getattr(job_worker, "metrics", {}) if job_worker is not None else {},
        "resultReconciler": getattr(reconciler, "metrics", {}) if reconciler is not None else {},
    }
