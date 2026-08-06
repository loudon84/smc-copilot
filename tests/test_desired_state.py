"""Desired state reconcile/apply tests."""

from __future__ import annotations

import pytest
from fakes.service_center import sample_desired_resources

from runtime.desired_state_reconciler import (
    DesiredResource,
    InstalledResource,
    build_reconciliation_plan,
)
from services.desired_state_service import DesiredStateService


# @lat: [[tests#Endpoint Sync#Reconciliation plan install upgrade remove]]
def test_reconciliation_plan_ops() -> None:
    plan = build_reconciliation_plan(
        revision=28,
        desired=[
            DesiredResource("skill", "sales-analysis", "1.3.0", checksum="c1"),
            DesiredResource("profile", "sales-expert", "2.1.0", checksum="c2"),
        ],
        installed=[
            InstalledResource("skill", "sales-analysis", "1.0.0"),
            InstalledResource("skill", "old-skill", "0.1.0"),
        ],
        removed_resources=[{"resourceType": "skill", "resourceId": "old-skill"}],
    )
    ops = {(o.operation, o.resource_id) for o in plan.operations}
    assert ("upgrade", "sales-analysis") in ops
    assert ("install", "sales-expert") in ops
    assert ("remove", "old-skill") in ops
    assert plan.restart_required is True


# @lat: [[tests#Endpoint Sync#Desired state apply via sync]]
@pytest.mark.asyncio
async def test_desired_state_apply(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_desired_state(revision=28, resources=sample_desired_resources())
    sync = await client.post("/api/v1/sync/now")
    assert sync.status_code == 200
    assert sync.json()["pulled"] >= 1

    from core.config import get_settings

    session_maker = app.state.session_maker
    async with session_maker() as session:
        svc = DesiredStateService(get_settings(), session, center)
        result = await svc.apply_revision(28)
        await session.commit()
    assert result["status"] == "applied"

    resources = await client.get("/api/v1/sync/resources")
    assert resources.status_code == 200
    ids = {r["resourceId"] for r in resources.json()}
    assert "sales-expert" in ids
    assert "sales-analysis" in ids


# @lat: [[tests#Endpoint Sync#Desired state checksum failure]]
@pytest.mark.asyncio
async def test_desired_state_bad_checksum(enrolled_client) -> None:
    client, app, center = enrolled_client
    center.enqueue_desired_state(
        revision=29,
        resources=[
            {
                "resourceType": "skill",
                "resourceId": "bad-skill",
                "version": "9.9.9",
                "checksum": "bad:deadbeef",
                "artifactUrl": "stub://bad",
            }
        ],
    )
    sync = await client.post("/api/v1/sync/now")
    assert sync.status_code == 200

    from core.config import get_settings
    from core.errors import ConflictError

    session_maker = app.state.session_maker
    async with session_maker() as session:
        svc = DesiredStateService(get_settings(), session, center)
        with pytest.raises(ConflictError):
            await svc.apply_revision(29)
        await session.rollback()
