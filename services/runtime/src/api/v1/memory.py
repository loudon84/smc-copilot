from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.memory import (
    MemoryContentPutRequest,
    MemoryEntryCreateRequest,
    MemoryEntryUpdateRequest,
    MemoryInfoResponse,
    MemoryMutationResponse,
    UserProfilePutRequest,
)
from services.memory_service import MemoryService

router = APIRouter(tags=["memory"])


@router.get("/instances/{instance_id}/memory", response_model=MemoryInfoResponse)
async def get_memory(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryInfoResponse:
    return await MemoryService(settings, session).get_memory(instance_id)


@router.post(
    "/instances/{instance_id}/memory/entries",
    response_model=MemoryMutationResponse,
)
async def add_memory_entry(
    instance_id: str,
    body: MemoryEntryCreateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryMutationResponse:
    return await MemoryService(settings, session).add_entry(instance_id, body.content)


@router.patch(
    "/instances/{instance_id}/memory/entries/{index}",
    response_model=MemoryMutationResponse,
)
async def update_memory_entry(
    instance_id: str,
    index: int,
    body: MemoryEntryUpdateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryMutationResponse:
    return await MemoryService(settings, session).update_entry(instance_id, index, body.content)


@router.delete(
    "/instances/{instance_id}/memory/entries/{index}",
    response_model=MemoryMutationResponse,
)
async def delete_memory_entry(
    instance_id: str,
    index: int,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryMutationResponse:
    return await MemoryService(settings, session).remove_entry(instance_id, index)


@router.put(
    "/instances/{instance_id}/memory/content",
    response_model=MemoryMutationResponse,
)
async def put_memory_content(
    instance_id: str,
    body: MemoryContentPutRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryMutationResponse:
    return await MemoryService(settings, session).write_content(instance_id, body.content)


@router.put(
    "/instances/{instance_id}/user-profile",
    response_model=MemoryMutationResponse,
)
async def put_user_profile(
    instance_id: str,
    body: UserProfilePutRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryMutationResponse:
    return await MemoryService(settings, session).write_user_profile(instance_id, body.content)
