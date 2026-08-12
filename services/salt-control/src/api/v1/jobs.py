from __future__ import annotations

from fastapi import APIRouter, Request

from core.auth import OperatorAuth
from schemas.job import EndpointStatusResponse, JobCreateRequest, JobResponse

router = APIRouter(tags=["jobs"])


@router.post("/jobs", response_model=JobResponse)
async def create_job(
    body: JobCreateRequest,
    request: Request,
    _auth: OperatorAuth,
) -> JobResponse:
    response = await request.app.state.job_service.create(body)
    worker = getattr(request.app.state, "job_worker", None)
    if worker is not None and not response.duplicate:
        worker.notify()
    return response


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, request: Request, _auth: OperatorAuth) -> JobResponse:
    return await request.app.state.job_service.get(job_id)


@router.get("/endpoints/{endpoint_id}/status", response_model=EndpointStatusResponse)
async def endpoint_status(
    endpoint_id: str,
    request: Request,
    _auth: OperatorAuth,
) -> EndpointStatusResponse:
    return await request.app.state.job_service.endpoint_status(endpoint_id)


@router.get("/observer/stability")
async def observer_stability(request: Request, _auth: OperatorAuth) -> dict:
    observer = getattr(request.app.state, "observer", None)
    if observer is None:
        return {"status": "disabled"}
    return observer.stability_report()
