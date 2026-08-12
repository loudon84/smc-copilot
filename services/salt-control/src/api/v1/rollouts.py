from __future__ import annotations

from fastapi import APIRouter

from api.deps import RequestServicesDep
from core.auth import OperatorAuth
from schemas.rollout import (
    RolloutActionRequest,
    RolloutApprovalRequest,
    RolloutCreateRequest,
    RolloutResponse,
)

router = APIRouter(prefix="/rollouts", tags=["rollouts"])


@router.post("", response_model=RolloutResponse)
async def create_rollout(
    body: RolloutCreateRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.create(body, actor_id=auth.subject)


@router.get("/{rollout_id}", response_model=RolloutResponse)
async def get_rollout(
    rollout_id: str,
    services: RequestServicesDep,
    _auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.get(rollout_id)


@router.post("/{rollout_id}:approve", response_model=RolloutResponse)
async def approve_rollout(
    rollout_id: str,
    body: RolloutApprovalRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.approve(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:advance", response_model=RolloutResponse)
async def advance_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.advance(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:pause", response_model=RolloutResponse)
async def pause_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.pause(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:resume", response_model=RolloutResponse)
async def resume_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.resume(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:abort", response_model=RolloutResponse)
async def abort_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.abort(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:rollback", response_model=RolloutResponse)
async def rollback_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    services: RequestServicesDep,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await services.rollout_service.rollback(rollout_id, body, actor_id=auth.subject)
