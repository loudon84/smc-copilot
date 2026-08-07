from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from api.deps import get_gateway_supervisor, get_profile_service
from schemas.gateway import GatewayHealthResponse, GatewayLogsResponse
from services.gateway_supervisor import GatewaySupervisor
from services.profile_service import ProfileService

router = APIRouter(prefix="/gateways", tags=["gateways"])


@router.get("/{gateway_id}/health", response_model=GatewayHealthResponse)
async def gateway_health(
    gateway_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    svc: ProfileService = Depends(get_profile_service),
) -> GatewayHealthResponse:
    status_resp = await supervisor.get_gateway_health(gateway_id)
    profile = await svc.get_profile(gateway_id)
    return GatewayHealthResponse(
        gateway_id=gateway_id,
        profile_id=profile.id,
        status=status_resp.status.value,
        healthy=status_resp.healthy,
        gateway_port=status_resp.gateway_port,
        gateway_pid=status_resp.gateway_pid,
        message=status_resp.message,
    )


@router.get("/{gateway_id}/logs", response_model=GatewayLogsResponse)
async def gateway_logs(
    gateway_id: str,
    tail: int = Query(default=200, ge=1, le=2000),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    svc: ProfileService = Depends(get_profile_service),
) -> GatewayLogsResponse:
    profile = await svc.get_profile(gateway_id)
    lines, truncated = supervisor.read_gateway_logs(gateway_id, tail=tail, profile_name=profile.name)
    return GatewayLogsResponse(
        gateway_id=gateway_id,
        profile_id=profile.id,
        lines=lines,
        truncated=truncated,
    )
