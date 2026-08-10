"""Agent Slash Command Catalog API (PRD v1.6 FR-01)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.chat_commands import ChatCommandsResponse
from services.chat_command_service import ChatCommandService

router = APIRouter(tags=["chat-commands"])


@router.get(
    "/instances/{instance_id}/chat/commands",
    response_model=ChatCommandsResponse,
)
async def list_chat_commands(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> ChatCommandsResponse:
    return await ChatCommandService(session, settings).list_commands(instance_id)
