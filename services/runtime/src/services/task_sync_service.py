from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import OutboxStatus
from db.models.task_related import SyncOutbox
from db.repositories.v12_repos import SyncOutboxRepository


class TaskSyncService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._outbox = SyncOutboxRepository(session)

    async def enqueue(
        self,
        *,
        target_type: str,
        target_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> SyncOutbox:
        body = json.dumps(payload, default=str)
        row = SyncOutbox(
            target_type=target_type,
            target_id=target_id,
            event_type=event_type,
            payload_json=body,
            status=OutboxStatus.PENDING.value,
            retry_count=0,
        )
        return await self._outbox.create(row)

    async def list_pending_for_process(self, limit: int = 50) -> list[SyncOutbox]:
        return await self._outbox.list_pending(limit=limit)

    @staticmethod
    def fingerprint(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()[:24]
