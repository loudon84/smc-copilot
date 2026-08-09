"""Multi-instance readiness (PRD v1.5 §84)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import Settings
from db.models.runtime import HermesInstance
from services.runtime_status_service import RuntimeStatusService


@pytest.mark.asyncio
async def test_multi_instance_default_healthy_coding_error() -> None:
    # @lat: [[tests#Readiness multi-instance#Default healthy]]
    default = HermesInstance(
        id="d1",
        name="default",
        profile_name="default",
        gateway_port=8642,
        status="running",
        healthy=True,
        auto_start=True,
        desired_state="running",
        process_state="alive",
        api_state="healthy",
        ownership_state="owned",
    )
    coding = HermesInstance(
        id="c1",
        name="coding",
        profile_name="coding",
        gateway_port=8643,
        status="error",
        healthy=False,
        auto_start=False,
        desired_state="running",
        process_state="exited",
        api_state="unreachable",
        ownership_state="stale",
    )
    finance = HermesInstance(
        id="f1",
        name="finance",
        profile_name="finance",
        gateway_port=8644,
        status="stopped",
        healthy=False,
        auto_start=False,
        desired_state="stopped",
        process_state="missing",
        api_state="unknown",
        ownership_state="unknown",
    )

    session = AsyncMock()

    async def execute(stmt):  # noqa: ANN001
        result = MagicMock()
        text = str(stmt)
        if "default" in text and "name" in text.lower():
            result.scalar_one_or_none.return_value = default
            result.scalars.return_value.all.return_value = [default]
        else:
            result.scalar_one_or_none.return_value = None
            result.scalars.return_value.all.return_value = [default, coding, finance]
        return result

    session.execute = AsyncMock(side_effect=execute)

    settings = Settings()
    svc = RuntimeStatusService(settings, session)

    with (
        patch.object(svc._versions, "get_active", AsyncMock(return_value=None)),
        patch.object(svc._jobs, "list_incomplete", AsyncMock(return_value=[])),
        patch("services.runtime_status_service.SecretStore") as store_cls,
        patch("services.runtime_status_service.EnvironmentProbe") as probe_cls,
    ):
        store = MagicMock()
        store._load = MagicMock()
        store_cls.return_value = store
        probe = MagicMock()
        probe.probe.return_value = MagicMock(disk_free_bytes=10**10)
        probe_cls.return_value = probe

        # Force hermes check via fake active version path in readiness_checks — monkeypatch checks path
        async def fake_checks() -> dict[str, str]:
            return {
                "database": "ok",
                "migration": "ok",
                "secretStore": "ok",
                "jobWorker": "ok",
                "hermes": "ok",
                "instance": "ok",
                "defaultInstance": "ok",
                "gateway": "ok",
                "disk": "ok",
                "manifest": "missing",
            }

        svc.readiness_checks = fake_checks  # type: ignore[method-assign]
        readiness = await svc.readiness_v2()

    assert readiness.execution.chat_ready is True
    assert readiness.execution.task_ready is True
    assert readiness.execution.instances is not None
    assert readiness.execution.instances["healthy"] == 1
    assert readiness.execution.instances["error"] == 1
    assert readiness.execution.default_instance is not None
    assert readiness.execution.default_instance["healthy"] is True
