"""PRD v1.4.1 §78 — foreign gateway port conflict must not kill external PID."""

from __future__ import annotations

# @lat: [[tests#v1.4.1 Hotfix#Foreign gateway port conflict]]

import sys

import pytest

from core.runtime_enums import InstanceStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeVersion
from db.session import create_sessionmaker


@pytest.mark.asyncio
async def test_foreign_gateway_port_conflict_does_not_kill(
    app_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _client, supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        ver = RuntimeVersion(
            version="0.21.0-port-conflict",
            channel="development",
            install_path=str(settings.resolved_runtime_data_dir() / "versions" / "0.21.0"),
            executable_path=sys.executable,
            status="active",
        )
        session.add(ver)
        await session.flush()
        inst = HermesInstance(
            name="port-conflict-default",
            profile_name="default",
            runtime_version_id=ver.id,
            gateway_port=8642,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=False,
            pid=None,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id

    killed: list[int] = []

    monkeypatch.setattr(
        "services.instance_gateway_service.is_port_available",
        lambda host, port: False,
    )
    monkeypatch.setattr(
        "services.instance_gateway_service.find_pids_listening_on_port",
        lambda port: [424242],
    )
    monkeypatch.setattr(
        "services.instance_gateway_service.terminate_pid",
        lambda pid, **kwargs: killed.append(pid),
    )
    monkeypatch.setattr(
        "runtime.gateway_process.terminate_pid",
        lambda pid, **kwargs: killed.append(pid),
    )

    with pytest.raises(RuntimeServiceError) as exc:
        await supervisor.start_instance(instance_id)

    assert exc.value.code == "gateway_port_conflict"
    assert killed == []

    async with session_maker() as session:
        row = await session.get(HermesInstance, instance_id)
        assert row is not None
        assert row.pid is None
