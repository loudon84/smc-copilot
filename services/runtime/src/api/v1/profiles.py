from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session, get_gateway_supervisor, get_profile_service
from core.errors import NotFoundError
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import AuditRepository, TaskEventRepository
from schemas.profile import (
    ProfileCreate,
    ProfileResponse,
    ProfileStatusResponse,
    ProfileUpdate,
)
from schemas.profile_events import ProfileEventResponse
from services.gateway_supervisor import GatewaySupervisor
from services.profile_service import ProfileService

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("", response_model=list[ProfileResponse])
async def list_profiles(svc: ProfileService = Depends(get_profile_service)) -> list[ProfileResponse]:
    profiles = await svc.list_profiles()
    return [ProfileResponse.model_validate(p) for p in profiles]


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: ProfileCreate,
    svc: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    profile = await svc.create_profile(body)
    return ProfileResponse.model_validate(profile)


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(
    profile_id: str,
    svc: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    profile = await svc.get_profile(profile_id)
    return ProfileResponse.model_validate(profile)


@router.patch("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: str,
    body: ProfileUpdate,
    svc: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    profile = await svc.update_profile(profile_id, body)
    return ProfileResponse.model_validate(profile)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: str,
    svc: ProfileService = Depends(get_profile_service),
) -> None:
    await svc.delete_profile(profile_id)


@router.post("/{profile_id}/start", response_model=ProfileStatusResponse)
async def start_profile(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> ProfileStatusResponse:
    return await supervisor.start_profile(profile_id)


@router.post("/{profile_id}/stop", response_model=ProfileStatusResponse)
async def stop_profile(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> ProfileStatusResponse:
    return await supervisor.stop_profile(profile_id)


@router.get("/{profile_id}/status", response_model=ProfileStatusResponse)
async def profile_status(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> ProfileStatusResponse:
    return await supervisor.refresh_status(profile_id)


@router.post("/{profile_id}/restart", response_model=ProfileStatusResponse)
async def restart_profile(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> ProfileStatusResponse:
    return await supervisor.restart_profile(profile_id)


@router.get("/{profile_id}/health", response_model=ProfileStatusResponse)
async def profile_health(
    profile_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> ProfileStatusResponse:
    return await supervisor.refresh_status(profile_id)


@router.get("/{profile_id}/events", response_model=list[ProfileEventResponse])
async def profile_events(
    profile_id: str,
    session: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ProfileEventResponse]:
    profile = await ProfileRepository(session).get_by_id(profile_id)
    if profile is None:
        raise NotFoundError(f"Profile {profile_id} not found")

    task_events = await TaskEventRepository(session).list_by_profile_id(profile_id, limit=limit)
    audit_logs = await AuditRepository(session).list_by_profile_id(profile_id, limit=limit)

    merged: list[ProfileEventResponse] = []
    for ev in task_events:
        merged.append(
            ProfileEventResponse(
                id=ev.id,
                source="task",
                event_type=ev.event_type,
                task_id=ev.task_id,
                message=ev.message,
                event_payload=ev.event_payload,
                created_at=ev.created_at,
            )
        )
    for row in audit_logs:
        merged.append(
            ProfileEventResponse(
                id=row.id,
                source="audit",
                event_type=row.action,
                task_id=row.task_id,
                message=None,
                event_payload=row.payload_json,
                created_at=row.created_at,
            )
        )
    merged.sort(key=lambda e: e.created_at, reverse=True)
    return merged[:limit]
