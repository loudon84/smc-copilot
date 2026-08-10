"""Session Files + Chat Settings + Workspace browse API (PRD v1.6 FR-04/06/07/12/13)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from schemas.session_chat_settings import SessionChatSettingsPatchBody, SessionChatSettingsResponse
from schemas.session_files import (
    SessionFileContextResponse,
    SessionFileSearchResponse,
    SessionFilesResponse,
)
from schemas.workspace import (
    WorkspaceFileResponse,
    WorkspaceListResponse,
    WorkspaceTerminalPathResponse,
)
from services.session_chat_settings_service import SessionChatSettingsService
from services.session_file_service import SessionFileService
from services.workspace_browse_service import WorkspaceBrowseService

router = APIRouter(tags=["session-chat"])


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/files",
    response_model=SessionFilesResponse,
)
async def list_session_files(
    instance_id: str,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> SessionFilesResponse:
    return await SessionFileService(session).list_files(instance_id, session_id)


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/files/search",
    response_model=SessionFileSearchResponse,
)
async def search_session_files(
    instance_id: str,
    session_id: str,
    q: str = Query(default=""),
    session: AsyncSession = Depends(get_db_session),
) -> SessionFileSearchResponse:
    return await SessionFileService(session).search_files(instance_id, session_id, q)


@router.post(
    "/instances/{instance_id}/sessions/{session_id}/files/{file_id}/context",
    response_model=SessionFileContextResponse,
)
async def add_session_file_context(
    instance_id: str,
    session_id: str,
    file_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> SessionFileContextResponse:
    return await SessionFileService(session).add_to_context(instance_id, session_id, file_id)


@router.delete(
    "/instances/{instance_id}/sessions/{session_id}/files/{file_id}/context",
    response_model=SessionFileContextResponse,
)
async def remove_session_file_context(
    instance_id: str,
    session_id: str,
    file_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> SessionFileContextResponse:
    return await SessionFileService(session).remove_from_context(instance_id, session_id, file_id)


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/chat-settings",
    response_model=SessionChatSettingsResponse,
)
async def get_session_chat_settings(
    instance_id: str,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> SessionChatSettingsResponse:
    return await SessionChatSettingsService(session).get(instance_id, session_id)


@router.patch(
    "/instances/{instance_id}/sessions/{session_id}/chat-settings",
    response_model=SessionChatSettingsResponse,
)
async def patch_session_chat_settings(
    instance_id: str,
    session_id: str,
    body: SessionChatSettingsPatchBody,
    session: AsyncSession = Depends(get_db_session),
) -> SessionChatSettingsResponse:
    return await SessionChatSettingsService(session).patch(instance_id, session_id, body)


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/workspace",
    response_model=WorkspaceListResponse,
)
async def list_session_workspace(
    instance_id: str,
    session_id: str,
    path: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceListResponse:
    return await WorkspaceBrowseService(session).list_directory(
        instance_id, session_id, path=path
    )


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/workspace/file",
    response_model=WorkspaceFileResponse,
)
async def read_session_workspace_file(
    instance_id: str,
    session_id: str,
    path: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceFileResponse:
    return await WorkspaceBrowseService(session).read_file(instance_id, session_id, path=path)


@router.get(
    "/instances/{instance_id}/sessions/{session_id}/workspace/terminal-path",
    response_model=WorkspaceTerminalPathResponse,
)
async def session_workspace_terminal_path(
    instance_id: str,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceTerminalPathResponse:
    return await WorkspaceBrowseService(session).terminal_path(instance_id, session_id)
