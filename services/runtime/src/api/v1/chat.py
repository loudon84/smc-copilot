"""Non-chat profile helpers retained after legacy /profiles/*/chat/* removal (PRD v1.1 §10)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from core.runtime_enums import InstanceStatus
from db.models.runtime import HermesInstance
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.chat import ResolvedProfile, WorkspaceChatSessionMessagesResponse
from services.instance_chat_service import InstanceChatService
from services.profile_ref_resolver import ProfileRefResolver

router = APIRouter(tags=["chat"])


def _instance_chat_service(session: AsyncSession = Depends(get_db_session)) -> InstanceChatService:
    return InstanceChatService(
        session,
        ChatSettingsRepository(session),
        ChatAttachmentRepository(session),
        WorkspaceRepository(session),
        profile_repo=ProfileRepository(session),
    )


async def _instance_id_for_profile(session: AsyncSession, profile_id: str) -> str:
    profile_repo = ProfileRepository(session)
    profile = await profile_repo.get_by_id(profile_id)
    if profile is None:
        from core.errors import profile_not_found

        raise profile_not_found(profile_id=profile_id)
    result = await session.execute(
        select(HermesInstance)
        .where(HermesInstance.profile_name == profile.name)
        .order_by(HermesInstance.created_at.asc())
        .limit(1)
    )
    inst = result.scalar_one_or_none()
    if inst is None:
        result = await session.execute(select(HermesInstance).where(HermesInstance.name == profile.name).limit(1))
        inst = result.scalar_one_or_none()
    if inst is None:
        inst = HermesInstance(
            name=profile.name,
            profile_name=profile.name,
            gateway_port=profile.gateway_port,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.flush()
    elif inst.gateway_port != profile.gateway_port:
        inst.gateway_port = profile.gateway_port
        await session.flush()
    return inst.id


@router.get("/profiles/resolve", response_model=ResolvedProfile)
async def resolve_profile(
    ref: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
) -> ResolvedProfile:
    resolver = ProfileRefResolver(ProfileRepository(session))
    return await resolver.resolve(ref)


@router.get(
    "/profiles/{profile_id}/sessions/{session_id}/messages",
    response_model=WorkspaceChatSessionMessagesResponse,
)
async def list_session_messages(
    profile_id: str,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> WorkspaceChatSessionMessagesResponse:
    instance_id = await _instance_id_for_profile(session, profile_id)
    return await svc.list_session_messages(instance_id, session_id)
