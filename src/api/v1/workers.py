from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from services.worker_service import WorkerService

router = APIRouter(prefix="/workers", tags=["workers"])


def get_worker_service(request: Request) -> WorkerService:
    supervisor = getattr(request.app.state, "worker_supervisor", None)
    if supervisor is None:
        raise HTTPException(status_code=503, detail="Worker supervisor not available")
    return WorkerService(supervisor)


@router.get("")
async def list_workers(svc: WorkerService = Depends(get_worker_service)) -> list[dict]:
    return svc.list_workers()


@router.get("/{name}")
async def get_worker(name: str, svc: WorkerService = Depends(get_worker_service)) -> dict:
    worker = svc.get_worker(name)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


@router.post("/{name}/restart")
async def restart_worker(name: str, svc: WorkerService = Depends(get_worker_service)) -> dict:
    ok = await svc.restart(name)
    if not ok:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"status": "restarting", "name": name}


@router.post("/{name}/pause")
async def pause_worker(name: str, svc: WorkerService = Depends(get_worker_service)) -> dict:
    ok = svc.pause(name)
    if not ok:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"status": "paused", "name": name}


@router.post("/{name}/resume")
async def resume_worker(name: str, svc: WorkerService = Depends(get_worker_service)) -> dict:
    ok = svc.resume(name)
    if not ok:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"status": "resumed", "name": name}
