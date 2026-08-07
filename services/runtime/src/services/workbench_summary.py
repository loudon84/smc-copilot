from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from db.models.local_task import LocalTask
from db.models.profile import Profile
from db.models.task_related import Approval
from integrations.team_hub.client import TeamHubClient
from schemas.v12_tasks import TaskWorkbenchSummary


def _count_map(rows: list[tuple[object, int]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for status, n in rows:
        key = str(status) if status is not None else "unknown"
        out[key] = int(n)
    return out


async def build_task_workbench_summary(
    session: AsyncSession,
    settings: Settings,
    hub: TeamHubClient,
) -> TaskWorkbenchSummary:
    pr = await session.execute(select(Profile.status, func.count()).group_by(Profile.status))
    profiles = _count_map(list(pr.all()))

    tr = await session.execute(select(LocalTask.status, func.count()).group_by(LocalTask.status))
    tasks = _count_map(list(tr.all()))

    ar = await session.execute(select(Approval.status, func.count()).group_by(Approval.status))
    approvals = _count_map(list(ar.all()))

    stub_pushes = len(getattr(hub, "pushed", []))

    team_sync: dict[str, str | bool | int] = {
        "use_stub": settings.team_hub_use_stub,
        "base_url_configured": bool((settings.team_hub_base_url or "").strip()),
        "stub_push_count": stub_pushes,
    }

    return TaskWorkbenchSummary(profiles=profiles, tasks=tasks, approvals=approvals, team_sync=team_sync)
