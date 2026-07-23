from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session, get_gateway_supervisor
from core.config import Settings
from schemas.runtime import (
    InstanceCreateRequest,
    InstanceResponse,
    InstanceUpdateRequest,
)
from services.gateway_supervisor import GatewaySupervisor
from services.instance_service import InstanceService

router = APIRouter(prefix="/instances", tags=["instances"])


def get_instance_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceService:
    return InstanceService(settings, session, supervisor=supervisor)


@router.get("", response_model=list[InstanceResponse])
async def list_instances(svc: InstanceService = Depends(get_instance_service)) -> list[InstanceResponse]:
    return await svc.list_instances()


@router.post("", response_model=InstanceResponse)
async def create_instance(
    body: InstanceCreateRequest,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.create(body)


@router.get("/{instance_id}", response_model=InstanceResponse)
async def get_instance(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.get_response(instance_id)


@router.patch("/{instance_id}", response_model=InstanceResponse)
async def patch_instance(
    instance_id: str,
    body: InstanceUpdateRequest,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.update(instance_id, body)


@router.delete("/{instance_id}")
async def delete_instance(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
) -> dict[str, str]:
    await svc.delete(instance_id)
    return {"status": "deleted"}


@router.post("/{instance_id}/start", response_model=InstanceResponse)
async def start_instance(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.start(instance_id)


@router.post("/{instance_id}/stop", response_model=InstanceResponse)
async def stop_instance(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.stop(instance_id)


@router.post("/{instance_id}/restart", response_model=InstanceResponse)
async def restart_instance(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
) -> InstanceResponse:
    return await svc.restart(instance_id)


@router.get("/{instance_id}/health", response_model=InstanceResponse)
async def instance_health(
    instance_id: str,
    svc: InstanceService = Depends(get_instance_service),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceResponse:
    status = await supervisor.refresh_status(instance_id)
    inst = await svc.get(instance_id)
    inst.healthy = status.healthy
    inst.status = status.status.value if hasattr(status.status, "value") else str(status.status)
    inst.pid = status.gateway_pid
    return await svc.get_response(instance_id)


@router.get("/{instance_id}/logs")
async def instance_logs(
    instance_id: str,
    tail: int = 200,
    svc: InstanceService = Depends(get_instance_service),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> dict:
    inst = await svc.get(instance_id)
    lines, truncated = supervisor.read_gateway_logs(instance_id, tail=tail, profile_name=inst.profile_name)
    return {"lines": lines, "truncated": truncated}
