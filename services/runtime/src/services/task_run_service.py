"""Task run queries (FR-402)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import NotFoundError
from db.repositories.work_task_repo import WorkTaskRepository


class TaskRunService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = WorkTaskRepository(session)

    async def list_runs(self, task_id: str) -> list[dict[str, Any]]:
        if await self._repo.get_task(task_id) is None:
            raise NotFoundError("work task not found")
        runs = await self._repo.list_runs(task_id)
        return [
            {
                "id": r.id,
                "taskId": r.task_id,
                "runNumber": r.run_number,
                "status": r.status,
                "hermesSessionId": r.hermes_session_id,
                "gatewayInstanceId": r.gateway_instance_id,
                "leaseId": r.lease_id,
                "startedAt": r.started_at.isoformat() if r.started_at else None,
                "finishedAt": r.finished_at.isoformat() if r.finished_at else None,
                "exitReason": r.exit_reason,
                "usage": json.loads(r.usage_json) if r.usage_json else None,
                "errorCode": r.error_code,
                "errorDetail": r.error_detail,
            }
            for r in runs
        ]

    async def get_run(self, run_id: str) -> dict[str, Any]:
        run = await self._repo.get_run(run_id)
        if run is None:
            raise NotFoundError("task run not found")
        return {
            "id": run.id,
            "taskId": run.task_id,
            "runNumber": run.run_number,
            "status": run.status,
            "hermesSessionId": run.hermes_session_id,
            "gatewayInstanceId": run.gateway_instance_id,
            "leaseId": run.lease_id,
            "startedAt": run.started_at.isoformat() if run.started_at else None,
            "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
            "exitReason": run.exit_reason,
            "usage": json.loads(run.usage_json) if run.usage_json else None,
            "errorCode": run.error_code,
            "errorDetail": run.error_detail,
        }
