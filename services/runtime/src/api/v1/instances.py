from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session, get_gateway_supervisor
from core.config import Settings
from schemas.runtime import (
    InstanceCreateRequest,
    InstanceCredentialsDiagnosticsResponse,
    InstanceDiagnosticsResponse,
    InstanceHealthResponse,
    InstanceResponse,
    InstanceStateResponse,
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


@router.post("/{instance_id}/reconcile")
async def reconcile_instance(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> dict:
    """Re-inspect ownership (PRD v1.5.1 §69). Not restart / force adopt."""
    return await supervisor.reconcile_instance(instance_id)


@router.get("/{instance_id}/health", response_model=InstanceHealthResponse)
async def instance_health(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceHealthResponse:
    payload = await supervisor.get_instance_health(instance_id)
    return InstanceHealthResponse.model_validate(payload)


@router.get("/{instance_id}/state", response_model=InstanceStateResponse)
async def instance_state(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceStateResponse:
    payload = await supervisor.get_instance_state(instance_id)
    return InstanceStateResponse.model_validate(payload)


@router.get("/{instance_id}/diagnostics", response_model=InstanceDiagnosticsResponse)
async def instance_diagnostics(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceDiagnosticsResponse:
    payload = await supervisor.get_instance_diagnostics(instance_id)
    return InstanceDiagnosticsResponse.model_validate(payload)


@router.get(
    "/{instance_id}/credentials/diagnostics",
    response_model=InstanceCredentialsDiagnosticsResponse,
)
async def instance_credentials_diagnostics(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> InstanceCredentialsDiagnosticsResponse:
    """PRD v1.5.3 — Hermes config/credential status without exposing secrets."""
    payload = await supervisor.get_instance_credentials_diagnostics(instance_id)
    return InstanceCredentialsDiagnosticsResponse.model_validate(payload)


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
