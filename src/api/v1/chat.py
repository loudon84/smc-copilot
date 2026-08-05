from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from core.runtime_enums import InstanceStatus
from db.models.runtime import HermesInstance
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.chat import (
    ChatModelListResponse,
    ProfileChatModelConfig,
    ResolvedProfile,
    SetProfileChatModelConfigPayload,
    WorkspaceChatAbortResponse,
    WorkspaceChatSendPayload,
    WorkspaceChatSessionMessagesResponse,
)
from services.instance_chat_service import InstanceChatService
from services.profile_ref_resolver import ProfileRefResolver
from services.sse_helpers import stream_sse_headers

router = APIRouter(tags=["chat"])

LEGACY_CHAT_DEPRECATION_HEADERS = {
    "Deprecation": "true",
    "Sunset": "Sat, 01 Aug 2026 00:00:00 GMT",
}


def _apply_deprecation(response: Response) -> None:
    for key, value in LEGACY_CHAT_DEPRECATION_HEADERS.items():
        response.headers[key] = value

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
        result = await session.execute(
            select(HermesInstance).where(HermesInstance.name == profile.name).limit(1)
        )
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
    response: Response = ...,
    session: AsyncSession = Depends(get_db_session),
) -> ResolvedProfile:
    resolver = ProfileRefResolver(ProfileRepository(session))
    result = await resolver.resolve(ref)
    _apply_deprecation(response)
    return result


@router.get(
    "/profiles/{profile_id}/sessions/{session_id}/messages",
    response_model=WorkspaceChatSessionMessagesResponse,
)
async def list_session_messages(
    profile_id: str,
    session_id: str,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> WorkspaceChatSessionMessagesResponse:
    instance_id = await _instance_id_for_profile(session, profile_id)
    _apply_deprecation(response)
    return await svc.list_session_messages(instance_id, session_id)


@router.get("/profiles/{profile_id}/chat/models", response_model=ChatModelListResponse)
async def list_chat_models(
    profile_id: str,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> ChatModelListResponse:
    instance_id = await _instance_id_for_profile(session, profile_id)
    _apply_deprecation(response)
    result = await svc.list_models(instance_id)
    return result.model_copy(update={"profile_id": profile_id})


@router.get("/profiles/{profile_id}/chat/model-config", response_model=ProfileChatModelConfig | None)
async def get_chat_model_config(
    profile_id: str,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> ProfileChatModelConfig | None:
    instance_id = await _instance_id_for_profile(session, profile_id)
    _apply_deprecation(response)
    config = await svc.get_model_config(instance_id)
    if config is None:
        return None
    return ProfileChatModelConfig(
        profile_id=profile_id,
        provider=config.provider,
        model_id=config.model_id,
        model_label=config.model_label,
        base_url=config.base_url,
        updated_at=config.updated_at,
    )


@router.put("/profiles/{profile_id}/chat/model-config", response_model=ProfileChatModelConfig)
async def set_chat_model_config(
    profile_id: str,
    body: SetProfileChatModelConfigPayload,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> ProfileChatModelConfig:
    instance_id = await _instance_id_for_profile(session, profile_id)
    _apply_deprecation(response)
    from schemas.chat import SetInstanceChatModelConfigPayload

    saved = await svc.set_model_config(
        instance_id,
        SetInstanceChatModelConfigPayload(
            provider=body.provider,
            model_id=body.model_id,
            model_label=body.model_label,
            base_url=body.base_url,
        ),
    )
    return ProfileChatModelConfig(
        profile_id=profile_id,
        provider=saved.provider,
        model_id=saved.model_id,
        model_label=saved.model_label,
        base_url=saved.base_url,
        updated_at=saved.updated_at,
    )


@router.post("/profiles/{profile_id}/chat/completions")
async def chat_completions(
    profile_id: str,
    body: WorkspaceChatSendPayload,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
):
    instance_id = await _instance_id_for_profile(session, profile_id)

    async def event_generator():
        async for chunk in svc.stream_chat(instance_id, body):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={**stream_sse_headers(), **LEGACY_CHAT_DEPRECATION_HEADERS},
    )


@router.post(
    "/profiles/{profile_id}/chat/abort",
    response_model=WorkspaceChatAbortResponse,
)
async def abort_chat_stream(
    profile_id: str,
    stream_id: str = Query(..., min_length=1),
    response: Response = ...,
    session: AsyncSession = Depends(get_db_session),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> WorkspaceChatAbortResponse:
    _ = await _instance_id_for_profile(session, profile_id)
    svc.abort(stream_id)
    _apply_deprecation(response)
    return WorkspaceChatAbortResponse(ok=True)
