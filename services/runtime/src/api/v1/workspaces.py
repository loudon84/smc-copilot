from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_session
from core.errors import NotFoundError
from db.models.workspace_db import Workspace
from db.repositories.v12_repos import WorkspaceRepository
from schemas.v12_tasks import (
    WorkspaceCreate,
    WorkspacePatch,
    WorkspaceResponse,
    WorkspaceValidateCommand,
    WorkspaceValidatePath,
)
from services.workspace_guard import WorkspaceGuard

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(session: AsyncSession = Depends(get_db_session)) -> list[WorkspaceResponse]:
    rows = await WorkspaceRepository(session).list_all()
    return [WorkspaceResponse.model_validate(r) for r in rows]


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceResponse:
    row = Workspace(
        name=body.name,
        root_path=body.root_path,
        type=body.type,
        enabled=body.enabled,
        policy_json=body.policy_json,
    )
    created = await WorkspaceRepository(session).create(row)
    return WorkspaceResponse.model_validate(created)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceResponse:
    row = await WorkspaceRepository(session).get(workspace_id)
    if row is None:
        raise NotFoundError("Workspace not found")
    return WorkspaceResponse.model_validate(row)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def patch_workspace(
    workspace_id: str,
    body: WorkspacePatch,
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceResponse:
    repo = WorkspaceRepository(session)
    row = await repo.get(workspace_id)
    if row is None:
        raise NotFoundError("Workspace not found")
    if body.name is not None:
        row.name = body.name
    if body.root_path is not None:
        row.root_path = body.root_path
    if body.type is not None:
        row.type = body.type
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.policy_json is not None:
        row.policy_json = body.policy_json
    saved = await repo.save(row)
    return WorkspaceResponse.model_validate(saved)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(workspace_id: str, session: AsyncSession = Depends(get_db_session)) -> None:
    repo = WorkspaceRepository(session)
    row = await repo.get(workspace_id)
    if row is None:
        raise NotFoundError("Workspace not found")
    await repo.delete(row)


@router.post("/{workspace_id}/validate-path")
async def validate_path(
    workspace_id: str,
    body: WorkspaceValidatePath,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    repo = WorkspaceRepository(session)
    row = await repo.get(workspace_id)
    if row is None:
        raise NotFoundError("Workspace not found")
    WorkspaceGuard().validate_path(row.root_path, body.path, row.policy_json)
    return {"status": "ok"}


@router.post("/{workspace_id}/validate-command")
async def validate_command(
    workspace_id: str,
    body: WorkspaceValidateCommand,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    repo = WorkspaceRepository(session)
    row = await repo.get(workspace_id)
    if row is None:
        raise NotFoundError("Workspace not found")
    classification = WorkspaceGuard().classify_command(body.command, row.policy_json)
    return {"classification": classification}
