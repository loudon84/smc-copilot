"""Remote Task v2 local API (PRD §18.3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_gateway_supervisor, get_service_center
from core.config import Settings, get_settings
from integrations.service_center.protocol import ServiceCenterClient
from schemas.remote_task import RemoteTaskRejectRequest
from services.gateway_supervisor import GatewaySupervisor
from services.remote_task_service import RemoteTaskService

router = APIRouter(prefix="/remote-tasks", tags=["remote-tasks"])


def _remote(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    center: ServiceCenterClient = Depends(get_service_center),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> RemoteTaskService:
    return RemoteTaskService(settings, session, center, supervisor)


@router.get("")
async def list_remote_tasks(svc: RemoteTaskService = Depends(_remote)) -> list[dict[str, Any]]:
    return await svc.list_assignments()


@router.get("/{task_id}")
async def get_remote_task(task_id: str, svc: RemoteTaskService = Depends(_remote)) -> dict[str, Any]:
    return await svc.get_assignment(task_id)


@router.post("/{task_id}/accept")
async def accept_remote_task(task_id: str, svc: RemoteTaskService = Depends(_remote)) -> dict[str, Any]:
    return await svc.accept(task_id)


@router.post("/{task_id}/reject")
async def reject_remote_task(
    task_id: str,
    body: RemoteTaskRejectRequest | None = None,
    svc: RemoteTaskService = Depends(_remote),
) -> dict[str, Any]:
    return await svc.reject(task_id, reason=(body.reason if body else None))


@router.post("/{task_id}/cancel")
async def cancel_remote_task(task_id: str, svc: RemoteTaskService = Depends(_remote)) -> dict[str, Any]:
    return await svc.cancel(task_id)


@router.get("/{task_id}/events")
async def remote_task_events(task_id: str, svc: RemoteTaskService = Depends(_remote)) -> list[dict[str, Any]]:
    return await svc.list_events(task_id)
