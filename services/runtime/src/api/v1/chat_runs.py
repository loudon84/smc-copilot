"""Chat Runtime v2 HTTP + SSE API (PRD v1.1 §8 / v1.2 §17 response_model)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.deps import get_app_settings, get_db_session, get_session_maker
from core.config import Settings
from schemas.chat_runs import (
    ChatAbortResponse,
    ChatAcceptedResult,
    ChatApprovalRespondBody,
    ChatClarifyRespondBody,
    ChatCreateRunBody,
    ChatCreateTurnBody,
    ChatEventResponse,
    ChatInteractionResponse,
    ChatQueueCreateBody,
    ChatQueueEntryResponse,
    ChatQueuePatchBody,
    ChatRunResponse,
    ChatSnapshotResponse,
)
from services.chat_event_service import ChatEventService
from services.chat_interaction_service import ChatInteractionService
from services.chat_queue_service import ChatQueueService
from services.chat_run_service import ChatRunService
from services.sse_helpers import parse_last_event_id, stream_sse_headers

router = APIRouter(prefix="/chat-runs", tags=["chat-runs"])

ChatInteractionRespondBody = Annotated[
    ChatClarifyRespondBody | ChatApprovalRespondBody,
    Field(discriminator="type"),
]


def _run_svc(
    session: AsyncSession = Depends(get_db_session),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> ChatRunService:
    return ChatRunService(session, session_maker=session_maker)


@router.post("", response_model=ChatAcceptedResult)
async def create_chat_run(
    body: ChatCreateRunBody,
    svc: ChatRunService = Depends(_run_svc),
) -> ChatAcceptedResult:
    return await svc.create_run(body)


@router.get("/{run_id}", response_model=ChatRunResponse)
async def get_chat_run(
    run_id: str,
    svc: ChatRunService = Depends(_run_svc),
) -> ChatRunResponse:
    return ChatRunResponse.model_validate(await svc.get_run(run_id))


@router.get("/{run_id}/snapshot", response_model=ChatSnapshotResponse)
async def get_chat_snapshot(
    run_id: str,
    svc: ChatRunService = Depends(_run_svc),
) -> ChatSnapshotResponse:
    return ChatSnapshotResponse.model_validate(await svc.get_snapshot(run_id))


@router.post("/{run_id}/turns", response_model=ChatAcceptedResult)
async def create_chat_turn(
    run_id: str,
    body: ChatCreateTurnBody,
    svc: ChatRunService = Depends(_run_svc),
) -> ChatAcceptedResult:
    return await svc.create_turn(run_id, body)


@router.post("/{run_id}/abort", response_model=ChatAbortResponse)
async def abort_chat_run(
    run_id: str,
    svc: ChatRunService = Depends(_run_svc),
) -> ChatAbortResponse:
    return ChatAbortResponse.model_validate(await svc.abort(run_id))


@router.get("/{run_id}/events", response_model=list[ChatEventResponse])
async def list_chat_events(
    run_id: str,
    session: AsyncSession = Depends(get_db_session),
    after_sequence: int | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[ChatEventResponse]:
    rows = await ChatEventService(session).list_events(run_id, after_sequence=after_sequence, limit=limit)
    return [ChatEventResponse.model_validate(row) for row in rows]


@router.get("/{run_id}/events/stream")
async def stream_chat_events(
    run_id: str,
    request: Request,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> StreamingResponse:
    last_id = parse_last_event_id(request.headers.get("Last-Event-ID"))

    async def gen() -> object:
        async for chunk in ChatEventService(session_maker()).iter_sse(
            request,
            session_maker,
            run_id,
            last_event_id=last_id,
        ):
            yield chunk

    allowed = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=stream_sse_headers(origin=request.headers.get("origin"), allowed_origins=allowed or None),
    )


@router.post(
    "/{run_id}/interactions/{request_id}/respond",
    response_model=ChatInteractionResponse,
)
async def respond_chat_interaction(
    run_id: str,
    request_id: str,
    body: ChatInteractionRespondBody,
    session: AsyncSession = Depends(get_db_session),
) -> ChatInteractionResponse:
    result = await ChatInteractionService(session).respond(run_id, request_id, body)
    return ChatInteractionResponse.model_validate(result)


@router.get("/{run_id}/queue", response_model=list[ChatQueueEntryResponse])
async def list_chat_queue(
    run_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> list[ChatQueueEntryResponse]:
    rows = await ChatQueueService(session).list_queue(run_id)
    return [ChatQueueEntryResponse.model_validate(row) for row in rows]


@router.post("/{run_id}/queue", response_model=ChatQueueEntryResponse)
async def enqueue_chat_queue(
    run_id: str,
    body: ChatQueueCreateBody,
    session: AsyncSession = Depends(get_db_session),
) -> ChatQueueEntryResponse:
    payload = dict(body.payload or {})
    extras = body.model_dump(exclude={"status", "payload"}, exclude_none=True)
    payload.update(extras)
    result = await ChatQueueService(session).enqueue(run_id, status=body.status, payload=payload)
    return ChatQueueEntryResponse.model_validate(result)


@router.patch("/{run_id}/queue/{queue_id}", response_model=ChatQueueEntryResponse)
async def patch_chat_queue(
    run_id: str,
    queue_id: str,
    body: ChatQueuePatchBody,
    session: AsyncSession = Depends(get_db_session),
) -> ChatQueueEntryResponse:
    result = await ChatQueueService(session).patch(
        run_id,
        queue_id,
        status=body.status,
        payload=body.payload,
    )
    return ChatQueueEntryResponse.model_validate(result)


@router.delete("/{run_id}/queue/{queue_id}", response_model=ChatQueueEntryResponse)
async def delete_chat_queue(
    run_id: str,
    queue_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> ChatQueueEntryResponse:
    result = await ChatQueueService(session).delete(run_id, queue_id)
    return ChatQueueEntryResponse.model_validate(result)
