from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session, get_gateway_supervisor, get_service_center, get_team_hub
from core.enums import SyncBindingStatus
from core.errors import NotFoundError
from db.repositories.v12_repos import TeamTaskBindingRepository
from integrations.team_hub.client import TeamHubClient
from schemas.v12_tasks import TeamTaskBindingResponse
from core.config import Settings
from integrations.service_center.protocol import ServiceCenterClient
from services.gateway_supervisor import GatewaySupervisor
from services.work_task_service import WorkTaskService
from services.task_sync_service import TaskSyncService

router = APIRouter(prefix="/team-tasks", tags=["team-tasks"])


@router.post("/pull")
async def pull_assignments(
    hub: TeamHubClient = Depends(get_team_hub),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
    center: ServiceCenterClient = Depends(get_service_center),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> dict[str, int]:
    assignments = await hub.poll_assignments()
    svc = WorkTaskService(settings, session, center, supervisor)
    ingested = 0
    for dto in assignments:
        task = await svc.ingest_team_assignment(hub, dto)
        if task is not None:
            ingested += 1
    return {"received": len(assignments), "ingested": ingested}


@router.get("", response_model=list[TeamTaskBindingResponse])
async def list_bindings(
    session: AsyncSession = Depends(get_db_session),
    limit: int = 100,
) -> list[TeamTaskBindingResponse]:
    rows = await TeamTaskBindingRepository(session).list_recent(limit=limit)
    return [TeamTaskBindingResponse.model_validate(r) for r in rows]


@router.get("/{binding_id}", response_model=TeamTaskBindingResponse)
async def get_binding(
    binding_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> TeamTaskBindingResponse:
    row = await TeamTaskBindingRepository(session).get(binding_id)
    if row is None:
        raise NotFoundError("Team task binding not found")
    return TeamTaskBindingResponse.model_validate(row)


@router.post("/{binding_id}/claim")
async def claim_binding(
    binding_id: str,
    hub: TeamHubClient = Depends(get_team_hub),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    repo = TeamTaskBindingRepository(session)
    row = await repo.get(binding_id)
    if row is None:
        raise NotFoundError("Team task binding not found")
    claimed = await hub.claim_assignment(row.remote_task_id, row.assignment_id)
    row.sync_status = SyncBindingStatus.PENDING.value
    row.last_sync_at = datetime.now(UTC)
    await repo.save(row)
    return {"claimed": claimed}


@router.post("/{binding_id}/sync")
async def sync_binding(binding_id: str, session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    repo = TeamTaskBindingRepository(session)
    row = await repo.get(binding_id)
    if row is None:
        raise NotFoundError("Team task binding not found")

    sync = TaskSyncService(session)
    await sync.enqueue(
        target_type="work_task",
        target_id=row.work_task_id or row.local_task_id,
        event_type="team_sync_requested",
        payload={
            "binding_id": row.id,
            "remote_task_id": row.remote_task_id,
            "assignment_id": row.assignment_id,
        },
    )
    row.sync_status = SyncBindingStatus.PENDING.value
    row.last_sync_at = datetime.now(UTC)
    await repo.save(row)
    return {"status": "enqueued"}
