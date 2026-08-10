from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from db.repositories.chat_attachment_repo import ChatAttachmentRepository
from db.repositories.chat_settings_repo import ChatSettingsRepository
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import WorkspaceRepository
from schemas.chat import (
    ChatModelListResponse,
    InstanceChatModelConfig,
    ResolvedInstance,
    SetInstanceChatModelConfigPayload,
    WorkspaceChatAbortResponse,
    WorkspaceChatSendPayload,
    WorkspaceChatSessionMessagesResponse,
)
from services.instance_chat_service import InstanceChatService
from services.instance_ref_resolver import InstanceRefResolver
from services.sse_helpers import stream_sse_headers

router = APIRouter(tags=["instance-chat"])


def _instance_chat_service(session: AsyncSession = Depends(get_db_session)) -> InstanceChatService:
    return InstanceChatService(
        session,
        ChatSettingsRepository(session),
        ChatAttachmentRepository(session),
        WorkspaceRepository(session),
        profile_repo=ProfileRepository(session),
    )


@router.get("/instances/resolve", response_model=ResolvedInstance)
async def resolve_instance(
    ref: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
) -> ResolvedInstance:
    resolver = InstanceRefResolver(session)
    return await resolver.resolve(ref)


@router.get("/instances/{instance_id}/chat/models", response_model=ChatModelListResponse)
async def list_instance_chat_models(
    instance_id: str,
    refresh: bool = Query(False),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> ChatModelListResponse:
    return await svc.list_models(instance_id, refresh=refresh)


@router.get("/instances/{instance_id}/chat/model-options", response_model=ChatModelListResponse)
async def list_instance_model_options(
    instance_id: str,
    refresh: bool = Query(False),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> ChatModelListResponse:
    return await svc.get_model_options(instance_id, refresh=refresh)


@router.get(
    "/instances/{instance_id}/chat/model-config",
    response_model=InstanceChatModelConfig | None,
)
async def get_instance_chat_model_config(
    instance_id: str,
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> InstanceChatModelConfig | None:
    return await svc.get_model_config(instance_id)


@router.put("/instances/{instance_id}/chat/model-config", response_model=InstanceChatModelConfig)
async def set_instance_chat_model_config(
    instance_id: str,
    body: SetInstanceChatModelConfigPayload,
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> InstanceChatModelConfig:
    return await svc.set_model_config(instance_id, body)


@router.post("/instances/{instance_id}/chat/completions")
async def instance_chat_completions(
    instance_id: str,
    body: WorkspaceChatSendPayload,
    svc: InstanceChatService = Depends(_instance_chat_service),
):
    async def event_generator():
        async for chunk in svc.stream_chat(instance_id, body):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=stream_sse_headers(),
    )


@router.post(
    "/instances/{instance_id}/chat/abort",
    response_model=WorkspaceChatAbortResponse,
)
async def abort_instance_chat_stream(
    instance_id: str,
    stream_id: str = Query(..., min_length=1),
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> WorkspaceChatAbortResponse:
    _ = instance_id
    svc.abort(stream_id)
    return WorkspaceChatAbortResponse(ok=True)


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/messages",
    response_model=WorkspaceChatSessionMessagesResponse,
)
async def list_instance_session_messages(
    instance_id: str,
    session_id: str,
    svc: InstanceChatService = Depends(_instance_chat_service),
) -> WorkspaceChatSessionMessagesResponse:
    return await svc.list_session_messages(instance_id, session_id)
