from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import get_gateway_supervisor, get_hermes_service
from schemas.hermes import (
    HermesModelsResponse,
    HermesRunCreate,
    HermesRunEventsResponse,
    HermesRunResponse,
)
from services.gateway_supervisor import GatewaySupervisor
from services.hermes_gateway_client import HermesGatewayService

router = APIRouter(prefix="/profiles/{profile_id}", tags=["hermes"])


@router.get("/models", response_model=HermesModelsResponse)
async def list_models(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    hermes: HermesGatewayService = Depends(get_hermes_service),
) -> HermesModelsResponse:
    profile = await supervisor.get_profile_for_hermes(profile_id)
    models, raw = await hermes.list_models(profile)
    return HermesModelsResponse(models=models, raw=raw)


@router.post("/runs", response_model=HermesRunResponse)
async def create_run(
    profile_id: str,
    body: HermesRunCreate,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    hermes: HermesGatewayService = Depends(get_hermes_service),
) -> HermesRunResponse:
    profile = await supervisor.get_profile_for_hermes(profile_id)
    run_id, raw = await hermes.create_run(profile, body)
    status_val = raw.get("status") if isinstance(raw.get("status"), str) else None
    return HermesRunResponse(run_id=run_id, status=status_val, raw=raw)


@router.get("/runs/{run_id}", response_model=HermesRunResponse)
async def get_run(
    profile_id: str,
    run_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    hermes: HermesGatewayService = Depends(get_hermes_service),
) -> HermesRunResponse:
    profile = await supervisor.get_profile_for_hermes(profile_id)
    raw = await hermes.get_run(profile, run_id)
    status_val = raw.get("status") if isinstance(raw.get("status"), str) else None
    return HermesRunResponse(run_id=run_id, status=status_val, raw=raw)


@router.get("/runs/{run_id}/events", response_model=HermesRunEventsResponse)
async def list_run_events(
    profile_id: str,
    run_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
    hermes: HermesGatewayService = Depends(get_hermes_service),
) -> HermesRunEventsResponse:
    profile = await supervisor.get_profile_for_hermes(profile_id)
    events = await hermes.list_run_events(profile, run_id)
    return HermesRunEventsResponse(run_id=run_id, events=events)
