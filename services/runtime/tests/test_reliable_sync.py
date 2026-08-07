"""Reliable sync tests (PRD FR-201–206)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from core.config import get_settings
from core.enums import DeliveryOutboxStatus, SyncAckOutboxStatus, SyncInboxStatus
from db.repositories.endpoint_sync_repo import EndpointSyncRepository
from integrations.service_center.client import StubServiceCenterClient
from services.runtime_sync_service import POISON_MAX_ATTEMPTS, RuntimeSyncService


async def _sync_service(app) -> tuple[RuntimeSyncService, StubServiceCenterClient]:
    center: StubServiceCenterClient = app.state.service_center
    session_maker = app.state.session_maker
    settings = get_settings()
    session = session_maker()
    return RuntimeSyncService(settings, session, center), center, session


# @lat: [[tests#Endpoint Sync#Commit before ack]]
@pytest.mark.asyncio
async def test_commit_before_ack(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_desired_state(
        revision=11,
        resources=[{"resourceType": "skill", "resourceId": "s1", "version": "1.0.0", "checksum": "x"}],
    )
    assert len(center.ack_records) == 0
    response = await client.post("/api/v1/sync/now")
    assert response.status_code == 200
    assert len(center.ack_records) == 0

    sync, _, session = await _sync_service(app)
    repo = EndpointSyncRepository(session)
    pending = await repo.list_due_ack_outbox(limit=10)
    assert pending
    assert all(row.status == SyncAckOutboxStatus.PENDING.value for row in pending)

    flushed = await sync.flush_ack_outbox()
    await session.commit()
    assert flushed >= 1
    assert len(center.ack_records) >= 1
    await session.close()


# @lat: [[tests#Endpoint Sync#Sequence gap detection]]
@pytest.mark.asyncio
async def test_sequence_gap_detection(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_desired_state(
        revision=1,
        resources=[{"resourceType": "skill", "resourceId": "s1", "version": "1.0.0", "checksum": "a"}],
    )
    await client.post("/api/v1/sync/now")
    center.enqueue_desired_state(
        revision=3,
        resources=[{"resourceType": "skill", "resourceId": "s2", "version": "1.0.0", "checksum": "b"}],
    )
    await client.post("/api/v1/sync/now")

    channels = await client.get("/api/v1/sync/channels")
    desired = next(c for c in channels.json() if c["channel"] == "desired_state")
    assert desired["status"] == "sequence_gap"


# @lat: [[tests#Endpoint Sync#Replay rejected]]
@pytest.mark.asyncio
async def test_replay_rejected(enrolled_client) -> None:
    client, app, center = enrolled_client
    message_id = center.enqueue_desired_state(
        revision=20,
        resources=[{"resourceType": "skill", "resourceId": "s1", "version": "1.0.0", "checksum": "x"}],
    )
    await client.post("/api/v1/sync/now")

    sync, _, session = await _sync_service(app)
    repo = EndpointSyncRepository(session)
    inbox = await repo.get_inbox_by_message_id(message_id)
    assert inbox is not None
    assert inbox.status == SyncInboxStatus.PROCESSED.value

    envelope = json.loads(inbox.payload_json)
    center.enqueue_change("desired_state", envelope)
    await client.post("/api/v1/sync/now")

    await session.close()
    _, _, session = await _sync_service(app)
    repo = EndpointSyncRepository(session)
    inbox = await repo.get_inbox_by_message_id(message_id)
    assert inbox is not None
    assert inbox.status == SyncInboxStatus.REPLAY_REJECTED.value
    await session.close()


# @lat: [[tests#Endpoint Sync#Poison quarantine allows next sequence]]
@pytest.mark.asyncio
async def test_poison_quarantine_allows_next_sequence(enrolled_client) -> None:
    _client, app, center = enrolled_client
    poison_id = center.enqueue_desired_state(
        revision=1,
        resources=[{"resourceType": "skill", "resourceId": "bad", "version": "1.0.0", "checksum": "x"}],
    )

    sync, _, session = await _sync_service(app)
    repo = EndpointSyncRepository(session)
    sync._dispatch_inbox = AsyncMock(side_effect=RuntimeError("dispatch failed"))  # type: ignore[method-assign]
    await sync.sync_now()
    inbox = await repo.get_inbox_by_message_id(poison_id)
    assert inbox is not None
    assert inbox.status == SyncInboxStatus.RETRY.value

    cred = await repo.get_credential()
    endpoint_id = cred.endpoint_id if cred else "ep-stub"
    item = json.loads(inbox.payload_json)
    for _ in range(POISON_MAX_ATTEMPTS - 1):
        inbox.status = SyncInboxStatus.RECEIVED.value
        await sync._dispatch_inbox_row(
            inbox=inbox,
            item=item,
            endpoint_id=endpoint_id,
            channel="desired_state",
            cursor="",
        )
    assert inbox.status == SyncInboxStatus.QUARANTINED.value
    poison = await repo.get_poison_by_message_id(poison_id)
    assert poison is not None
    await session.commit()
    await session.close()

    center.enqueue_desired_state(
        revision=2,
        resources=[{"resourceType": "skill", "resourceId": "good", "version": "1.0.0", "checksum": "y"}],
    )
    sync2, _, session2 = await _sync_service(app)
    result = await sync2.sync_now()
    await session2.commit()
    assert result["processed"] >= 1

    inbox = await repo.get_inbox_by_message_id(poison_id)
    assert inbox.status == SyncInboxStatus.QUARANTINED.value
    await session2.close()


@pytest.mark.asyncio
async def test_partial_event_ack_on_outbox(enrolled_client) -> None:
    client, app, center = enrolled_client
    sync, _, session = await _sync_service(app)
    repo = EndpointSyncRepository(session)

    row_ok = await sync.enqueue_delivery(
        channel="task_events",
        aggregate_type="task",
        aggregate_id="t1",
        event_type="task.started",
        payload={"taskId": "t1"},
    )
    row_bad = await sync.enqueue_delivery(
        channel="task_events",
        aggregate_type="task",
        aggregate_id="t2",
        event_type="task.started",
        payload={"taskId": "t2"},
    )
    await session.commit()

    center._events_batch_reject_ids.add(row_bad.event_id)
    flushed = await sync.flush_outbox(limit=10)
    await session.commit()
    assert flushed == 1

    ok = await repo.get_outbox(row_ok.id)
    bad = await repo.get_outbox(row_bad.id)
    assert ok is not None and ok.status == DeliveryOutboxStatus.ACKNOWLEDGED.value
    assert bad is not None and bad.status == DeliveryOutboxStatus.RETRY.value
    await session.close()


# @lat: [[tests#Endpoint Sync#Partial event ack on outbox]]
