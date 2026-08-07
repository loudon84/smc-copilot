"""Lease renewal for active task runs (FR-504)."""

from __future__ import annotations

from datetime import UTC, datetime

from core.logging import get_logger
from db.models.endpoint_sync import TaskLease
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from db.repositories.work_task_repo import WorkTaskRepository
from integrations.service_center.protocol import ServiceCenterClient

logger = get_logger(__name__)


class LeaseManager:
    def __init__(
        self,
        session,
        center: ServiceCenterClient,
        endpoint_id: str,
    ) -> None:
        self._session = session
        self._center = center
        self._endpoint_id = endpoint_id
        self._sync_repo = EndpointSyncRepository(session)
        self._tasks = WorkTaskRepository(session)
        self._failures: dict[str, int] = {}

    def renewal_interval_seconds(self, lease: TaskLease) -> float:
        heartbeat = float(lease.heartbeat_interval_seconds or 60)
        remaining = (lease.expires_at - datetime.now(UTC)).total_seconds()
        lease_third = max(remaining / 3.0, 5.0)
        return min(heartbeat, lease_third)

    async def renew(self, lease: TaskLease) -> bool:
        try:
            resp = await self._center.task_heartbeat(
                lease.assignment_id,
                lease_id=lease.lease_id,
            )
            expires = resp.expires_at
            if expires:
                try:
                    lease.expires_at = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                except ValueError:
                    pass
            lease.status = "active"
            self._failures.pop(lease.lease_id, None)
            return True
        except Exception:
            count = self._failures.get(lease.lease_id, 0) + 1
            self._failures[lease.lease_id] = count
            logger.warning("lease_renew_failed", lease_id=lease.lease_id, failures=count)
            if count >= 3 and lease.work_task_id:
                task = await self._tasks.get_task(lease.work_task_id)
                if task is not None:
                    task.status = "lease_at_risk"
            return False

    async def is_expired(self, lease: TaskLease) -> bool:
        expires = lease.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return expires < datetime.now(UTC)

    async def expire_lease(self, lease: TaskLease) -> None:
        lease.status = "expired"
        if lease.work_task_id:
            task = await self._tasks.get_task(lease.work_task_id)
            if task is not None:
                task.status = "expired"
            runs = await self._tasks.list_runs(lease.work_task_id)
            for run in runs:
                if run.status in {"starting", "running", "waiting_approval", "finalizing"}:
                    run.status = "expired"
                    run.exit_reason = "lease_expired"
