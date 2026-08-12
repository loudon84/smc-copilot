from __future__ import annotations

from fastapi import APIRouter, Request

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
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.create(body, actor_id=auth.subject)


@router.get("/{rollout_id}", response_model=RolloutResponse)
async def get_rollout(
    rollout_id: str,
    request: Request,
    _auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.get(rollout_id)


@router.post("/{rollout_id}:approve", response_model=RolloutResponse)
async def approve_rollout(
    rollout_id: str,
    body: RolloutApprovalRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.approve(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:advance", response_model=RolloutResponse)
async def advance_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.advance(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:pause", response_model=RolloutResponse)
async def pause_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.pause(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:resume", response_model=RolloutResponse)
async def resume_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.resume(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:abort", response_model=RolloutResponse)
async def abort_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.abort(rollout_id, body, actor_id=auth.subject)


@router.post("/{rollout_id}:rollback", response_model=RolloutResponse)
async def rollback_rollout(
    rollout_id: str,
    body: RolloutActionRequest,
    request: Request,
    auth: OperatorAuth,
) -> RolloutResponse:
    return await request.app.state.rollout_service.rollback(rollout_id, body, actor_id=auth.subject)
