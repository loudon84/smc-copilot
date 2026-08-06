"""Bidirectional sync orchestration: pull changes, inbox dedupe, outbox enqueue (PRD FR-10–FR-14)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import DeliveryOutboxStatus
from core.errors import CopilotError, NotFoundError
from db.models.endpoint_sync import DeliveryOutbox, SyncInbox
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.protocol import ServiceCenterClient
from runtime.delivery_backoff import compute_backoff_seconds, should_dead_letter
from runtime.sync_protocol import extract_message_meta
from services.desired_state_service import DesiredStateService
from services.endpoint_enrollment_service import DEFAULT_SYNC_CHANNELS, EndpointEnrollmentService
from services.remote_task_service import RemoteTaskService


# @lat: [[endpoint-sync#Sync Foundation]]
class RuntimeSyncService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        center: ServiceCenterClient,
    ) -> None:
        self._settings = settings
        self._repo = EndpointSyncRepository(session)
        self._center = center
        self._enrollment = EndpointEnrollmentService(settings, session, center)
        self._desired = DesiredStateService(settings, session, center)
        self._remote = RemoteTaskService(settings, session, center)

    async def status(self) -> dict[str, Any]:
        channels = await self._repo.list_channels()
        dead = await self._repo.list_dead_letters(limit=5)
        enrollment = await self._enrollment.status()
        return {
            "syncEnabled": enrollment.get("syncEnabled", False),
            "endpointId": enrollment.get("endpointId"),
            "channels": [
                {
                    "channel": c.channel,
                    "enabled": c.enabled,
                    "status": c.status,
                    "lastSyncAt": c.last_sync_at.isoformat() if c.last_sync_at else None,
                    "errorCode": c.error_code,
                }
                for c in channels
            ],
            "deadLetterCount": len(await self._repo.list_dead_letters(limit=500)),
            "recentDeadLetters": [
                {"id": d.id, "eventType": d.event_type, "lastError": d.last_error} for d in dead
            ],
        }

    async def list_channels(self) -> list[dict[str, Any]]:
        for name in DEFAULT_SYNC_CHANNELS:
            await self._repo.ensure_channel(name)
        rows = await self._repo.list_channels()
        out: list[dict[str, Any]] = []
        for c in rows:
            cursor = await self._repo.get_cursor(c.channel)
            out.append(
                {
                    "channel": c.channel,
                    "enabled": c.enabled,
                    "status": c.status,
                    "cursor": cursor.cursor_value if cursor else "",
                    "lastSyncAt": c.last_sync_at.isoformat() if c.last_sync_at else None,
                }
            )
        return out

    async def sync_now(self) -> dict[str, Any]:
        cred = await self._enrollment.ensure_access_token()
        pulled = 0
        processed = 0
        for channel in DEFAULT_SYNC_CHANNELS:
            ch = await self._repo.ensure_channel(channel)
            cursor_row = await self._repo.get_cursor(channel)
            cursor = cursor_row.cursor_value if cursor_row else ""
            try:
                changes = await self._center.get_changes(cred.endpoint_id, channel=channel, cursor=cursor)
                ack_ids: list[str] = []
                for item in changes.items:
                    meta = extract_message_meta(item)
                    mid = meta["message_id"]
                    if not mid:
                        continue
                    existing = await self._repo.get_inbox_by_message_id(mid)
                    if existing is not None:
                        ack_ids.append(mid)
                        continue
                    inbox = SyncInbox(
                        message_id=mid,
                        channel=channel,
                        idempotency_key=meta.get("idempotency_key"),
                        payload_hash=meta.get("payload_hash"),
                        payload_json=json.dumps(item, ensure_ascii=False),
                        message_type=meta.get("message_type"),
                        sequence=meta.get("sequence") if isinstance(meta.get("sequence"), int) else None,
                        status="received",
                    )
                    await self._repo.add_inbox(inbox)
                    pulled += 1
                    ack_ids.append(mid)
                    handled = await self._dispatch_inbox(channel, item)
                    if handled:
                        inbox.status = "processed"
                        inbox.processed_at = datetime.now(UTC)
                        processed += 1
                    else:
                        inbox.status = "ignored"
                        inbox.processed_at = datetime.now(UTC)
                if ack_ids:
                    await self._center.acks(cred.endpoint_id, ack_ids)
                if changes.next_cursor:
                    await self._repo.upsert_cursor(channel, changes.next_cursor)
                ch.status = "ok"
                ch.last_sync_at = datetime.now(UTC)
                ch.error_code = None
            except Exception as exc:
                ch.status = "error"
                ch.error_code = "sync_failed"
                raise CopilotError(f"sync failed on {channel}: {exc}", code="sync_failed") from exc
        flushed = await self.flush_outbox(limit=50)
        return {"pulled": pulled, "processed": processed, "outboxFlushed": flushed}

    async def _dispatch_inbox(self, channel: str, envelope: dict[str, Any]) -> bool:
        message_type = str(envelope.get("messageType") or "")
        payload = envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {}
        if channel == "desired_state" or message_type.startswith("desired_state"):
            await self._desired.ingest_desired_state(payload)
            return True
        if channel == "task_assignment" or message_type.startswith("task.assignment"):
            await self._remote.ingest_assignment(payload)
            return True
        if channel == "task_control" or message_type.startswith("task.control"):
            await self._remote.apply_control(payload)
            return True
        if channel == "staffdeck_review":
            return True
        return False

    async def enqueue_delivery(
        self,
        *,
        channel: str,
        aggregate_type: str,
        aggregate_id: str,
        event_type: str,
        payload: dict[str, Any],
        sequence: int | None = None,
    ) -> DeliveryOutbox:
        row = DeliveryOutbox(
            event_id=str(uuid4()),
            channel=channel,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            event_type=event_type,
            payload_json=json.dumps(payload, ensure_ascii=False),
            sequence=sequence,
            status=DeliveryOutboxStatus.PENDING.value,
            attempt_count=0,
        )
        return await self._repo.add_outbox(row)

    async def flush_outbox(self, *, limit: int = 100) -> int:
        cred = await self._repo.get_credential()
        if cred is None or cred.status != "active":
            return 0
        await self._enrollment.ensure_access_token()
        rows = await self._repo.list_due_outbox(limit=limit)
        flushed = 0
        events: list[dict[str, Any]] = []
        batch_rows: list[DeliveryOutbox] = []
        for row in rows:
            row.status = DeliveryOutboxStatus.SENDING.value
            try:
                payload = json.loads(row.payload_json)
            except json.JSONDecodeError:
                payload = {"raw": row.payload_json}
            events.append(
                {
                    "eventId": row.event_id,
                    "eventType": row.event_type,
                    "aggregateType": row.aggregate_type,
                    "aggregateId": row.aggregate_id,
                    "payload": payload,
                    "sequence": row.sequence,
                }
            )
            batch_rows.append(row)
        if not events:
            return 0
        try:
            await self._center.events_batch(cred.endpoint_id, events)
            now = datetime.now(UTC)
            for row in batch_rows:
                row.status = DeliveryOutboxStatus.ACKNOWLEDGED.value
                row.acknowledged_at = now
                flushed += 1
        except Exception as exc:
            max_retries = self._settings.delivery_outbox_max_retries
            for row in batch_rows:
                row.attempt_count += 1
                row.last_error = str(exc)[:500]
                if should_dead_letter(row.attempt_count, max_retries):
                    row.status = DeliveryOutboxStatus.DEAD_LETTER.value
                else:
                    row.status = DeliveryOutboxStatus.RETRY.value
                    delay = compute_backoff_seconds(row.attempt_count)
                    row.next_attempt_at = datetime.now(UTC) + timedelta(seconds=delay)
        return flushed

    async def list_dead_letters(self) -> list[dict[str, Any]]:
        rows = await self._repo.list_dead_letters(limit=200)
        return [
            {
                "id": r.id,
                "eventId": r.event_id,
                "channel": r.channel,
                "eventType": r.event_type,
                "attemptCount": r.attempt_count,
                "lastError": r.last_error,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def retry_dead_letter(self, outbox_id: str) -> dict[str, Any]:
        row = await self._repo.get_outbox(outbox_id)
        if row is None:
            raise NotFoundError("dead letter not found")
        row.status = DeliveryOutboxStatus.PENDING.value
        row.next_attempt_at = None
        row.last_error = None
        return {"id": row.id, "status": row.status}

    async def heartbeat_tick(self) -> None:
        cred = await self._enrollment.ensure_access_token()
        await self._center.heartbeat(
            cred.endpoint_id,
            {
                "runtimeVersion": __import__("version", fromlist=["__version__"]).__version__,
                "at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            },
        )
