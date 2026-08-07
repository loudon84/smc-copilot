"""Bidirectional sync orchestration: pull changes, inbox dedupe, outbox enqueue (PRD FR-10–FR-14, FR-201–206)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.enums import DeliveryOutboxStatus, SyncAckOutboxStatus, SyncInboxStatus
from core.errors import CopilotError, NotFoundError
from db.models.endpoint_sync import (
    DeliveryOutbox,
    SyncAckOutbox,
    SyncInbox,
    SyncPoisonMessage,
    SyncReplayNonce,
)
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.dto import EventsBatchResponse
from integrations.service_center.protocol import ServiceCenterClient
from runtime.delivery_backoff import compute_backoff_seconds, should_dead_letter
from runtime.sync_protocol import extract_message_meta, verify_envelope
from services.desired_state_service import DesiredStateService
from services.endpoint_enrollment_service import DEFAULT_SYNC_CHANNELS, EndpointEnrollmentService
from services.remote_task_service import RemoteTaskService

POISON_MAX_ATTEMPTS = 3


# @lat: [[endpoint-sync#Sync Foundation]]
# @lat: [[endpoint-sync#Reliable Sync]]
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
                sequence_gap = False
                for item in changes.items:
                    outcome = await self._process_change_item(
                        endpoint_id=cred.endpoint_id,
                        channel=channel,
                        item=item,
                        cursor=cursor,
                    )
                    if outcome == "sequence_gap":
                        sequence_gap = True
                        ch.status = "sequence_gap"
                        ch.error_code = "sequence_gap"
                        break
                    if outcome == "retry":
                        ch.status = "error"
                        ch.error_code = "dispatch_retry"
                        break
                    if outcome in ("pulled", "processed"):
                        pulled += 1
                    if outcome == "processed":
                        processed += 1
                if not sequence_gap and ch.error_code != "dispatch_retry":
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

    async def _process_change_item(
        self,
        *,
        endpoint_id: str,
        channel: str,
        item: dict[str, Any],
        cursor: str,
    ) -> str:
        if not self._should_skip_signature_verify() and not self._verify_item_signature(item):
            return "ignored"

        meta = extract_message_meta(item)
        mid = meta["message_id"]
        if not mid:
            return "ignored"

        nonce = self._extract_nonce(item, meta)
        existing = await self._repo.get_inbox_by_message_id(mid)
        if existing is not None or (nonce and await self._repo.has_replay_nonce(nonce)):
            if existing is not None:
                existing.status = SyncInboxStatus.REPLAY_REJECTED.value
                existing.processed_at = datetime.now(UTC)
            else:
                inbox = SyncInbox(
                    message_id=mid,
                    channel=channel,
                    idempotency_key=meta.get("idempotency_key"),
                    payload_hash=meta.get("payload_hash"),
                    payload_json=json.dumps(item, ensure_ascii=False),
                    message_type=meta.get("message_type"),
                    sequence=meta.get("sequence") if isinstance(meta.get("sequence"), int) else None,
                    status=SyncInboxStatus.REPLAY_REJECTED.value,
                    processed_at=datetime.now(UTC),
                )
                await self._repo.add_inbox(inbox)
            await self._enqueue_ack_outbox(
                endpoint_id=endpoint_id, channel=channel, message_id=mid, cursor=cursor
            )
            return "ignored"

        sequence = meta.get("sequence")
        if isinstance(sequence, int):
            last_seq = await self._repo.get_last_processed_sequence(channel)
            if last_seq is not None:
                expected = last_seq + 1
                if sequence != expected:
                    return "sequence_gap"

        inbox = SyncInbox(
            message_id=mid,
            channel=channel,
            idempotency_key=meta.get("idempotency_key"),
            payload_hash=meta.get("payload_hash"),
            payload_json=json.dumps(item, ensure_ascii=False),
            message_type=meta.get("message_type"),
            sequence=sequence if isinstance(sequence, int) else None,
            status=SyncInboxStatus.RECEIVED.value,
        )
        await self._repo.add_inbox(inbox)
        outcome = await self._dispatch_inbox_row(
            inbox=inbox, item=item, endpoint_id=endpoint_id, channel=channel, cursor=cursor
        )
        if nonce:
            await self._repo.add_replay_nonce(SyncReplayNonce(nonce=nonce, message_id=mid))
        return outcome

    async def _dispatch_inbox_row(
        self,
        *,
        inbox: SyncInbox,
        item: dict[str, Any],
        endpoint_id: str,
        channel: str,
        cursor: str,
    ) -> str:
        inbox.status = SyncInboxStatus.PROCESSING.value
        try:
            handled = await self._dispatch_inbox(channel, item)
            inbox.status = SyncInboxStatus.PROCESSED.value if handled else SyncInboxStatus.IGNORED.value
            inbox.processed_at = datetime.now(UTC)
            await self._enqueue_ack_outbox(
                endpoint_id=endpoint_id, channel=channel, message_id=inbox.message_id, cursor=cursor
            )
            return "processed" if handled else "pulled"
        except Exception as exc:
            inbox.attempt_count += 1
            inbox.last_error = str(exc)[:500]
            if inbox.attempt_count >= POISON_MAX_ATTEMPTS:
                inbox.status = SyncInboxStatus.QUARANTINED.value
                inbox.processed_at = datetime.now(UTC)
                await self._repo.add_poison_message(
                    SyncPoisonMessage(
                        message_id=inbox.message_id,
                        channel=channel,
                        sequence=inbox.sequence,
                        status=SyncInboxStatus.QUARANTINED.value,
                        attempt_count=inbox.attempt_count,
                        last_error=inbox.last_error,
                        payload_json=inbox.payload_json,
                    )
                )
                await self._enqueue_ack_outbox(
                    endpoint_id=endpoint_id, channel=channel, message_id=inbox.message_id, cursor=cursor
                )
                return "pulled"
            inbox.status = SyncInboxStatus.RETRY.value
            return "retry"

    def _should_skip_signature_verify(self) -> bool:
        if self._settings.service_center_use_stub:
            return True
        return not (self._settings.service_center_center_public_key or "").strip()

    def _verify_item_signature(self, item: dict[str, Any]) -> bool:
        public_key = (self._settings.service_center_center_public_key or "").strip()
        if not public_key:
            return True
        return verify_envelope(item, public_key)

    def _extract_nonce(self, item: dict[str, Any], meta: dict[str, Any]) -> str | None:
        raw = item.get("nonce") or item.get("replayNonce") or meta.get("idempotency_key")
        if raw is None:
            return None
        text = str(raw).strip()
        return text or None

    async def _enqueue_ack_outbox(
        self,
        *,
        endpoint_id: str,
        channel: str,
        message_id: str,
        cursor: str,
    ) -> None:
        existing = await self._repo.get_ack_outbox_by_message_id(message_id)
        if existing is not None:
            return
        await self._repo.add_ack_outbox(
            SyncAckOutbox(
                endpoint_id=endpoint_id,
                channel=channel,
                message_id=message_id,
                cursor=cursor,
                status=SyncAckOutboxStatus.PENDING.value,
                attempt_count=0,
            )
        )

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
            result = await self._center.events_batch(cred.endpoint_id, events)
            flushed += self._apply_events_batch_result(batch_rows, result)
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

    def _apply_events_batch_result(
        self,
        batch_rows: list[DeliveryOutbox],
        result: EventsBatchResponse,
    ) -> int:
        accepted = set(result.accepted)
        duplicate = set(result.duplicate)
        rejected_map = {
            str(item.get("eventId") or ""): str(item.get("code") or "rejected")
            for item in result.rejected
            if isinstance(item, dict)
        }
        flushed = 0
        now = datetime.now(UTC)
        max_retries = self._settings.delivery_outbox_max_retries
        for row in batch_rows:
            event_id = row.event_id
            if event_id in accepted or event_id in duplicate:
                row.status = DeliveryOutboxStatus.ACKNOWLEDGED.value
                row.acknowledged_at = now
                flushed += 1
                continue
            code = rejected_map.get(event_id)
            if code:
                row.attempt_count += 1
                row.last_error = code[:500]
                if should_dead_letter(row.attempt_count, max_retries):
                    row.status = DeliveryOutboxStatus.DEAD_LETTER.value
                else:
                    row.status = DeliveryOutboxStatus.RETRY.value
                    delay = compute_backoff_seconds(row.attempt_count)
                    row.next_attempt_at = now + timedelta(seconds=delay)
                continue
            row.attempt_count += 1
            row.last_error = "events_batch_no_status"
            row.status = DeliveryOutboxStatus.RETRY.value
            delay = compute_backoff_seconds(row.attempt_count)
            row.next_attempt_at = now + timedelta(seconds=delay)
        return flushed

    async def flush_ack_outbox(self, *, limit: int = 100) -> int:
        cred = await self._repo.get_credential()
        if cred is None or cred.status != "active":
            return 0
        await self._enrollment.ensure_access_token()
        rows = await self._repo.list_due_ack_outbox(limit=limit)
        if not rows:
            return 0
        message_ids = [row.message_id for row in rows]
        for row in rows:
            row.status = SyncAckOutboxStatus.SENDING.value
        try:
            await self._center.acks(cred.endpoint_id, message_ids)
            now = datetime.now(UTC)
            for row in rows:
                row.status = SyncAckOutboxStatus.ACKNOWLEDGED.value
                row.acknowledged_at = now
            return len(rows)
        except Exception as exc:
            max_retries = self._settings.delivery_outbox_max_retries
            for row in rows:
                row.attempt_count += 1
                row.last_error = str(exc)[:500]
                if should_dead_letter(row.attempt_count, max_retries):
                    row.status = SyncAckOutboxStatus.DEAD_LETTER.value
                else:
                    row.status = SyncAckOutboxStatus.RETRY.value
                    delay = compute_backoff_seconds(row.attempt_count)
                    row.next_attempt_at = datetime.now(UTC) + timedelta(seconds=delay)
            return 0

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
