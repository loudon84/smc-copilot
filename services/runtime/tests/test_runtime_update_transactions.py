from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from core.config import Settings
from core.runtime_enums import InstanceStatus, RuntimeVersionStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeJob, RuntimeVersion
from db.session import create_sessionmaker
from runtime.cancellation_token import CancellationToken, JobCancelled
from services.installation_service import InstallationService
from services.runtime_version_pin_service import RuntimeVersionPinService
from services.update_service import UpdateService


@pytest.mark.asyncio
# @lat: [[tests#Transactional update#Rebinds instances on success]]
async def test_update_rebinds_instances(app_client) -> None:
    client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        old_ver = RuntimeVersion(
            version="0.19.0",
            channel="stable",
            install_path="/tmp/old",
            executable_path=sys.executable,
            status=RuntimeVersionStatus.ACTIVE.value,
        )
        new_ver = RuntimeVersion(
            version="0.20.0",
            channel="stable",
            install_path="/tmp/new",
            executable_path=sys.executable,
            status=RuntimeVersionStatus.INSTALLED.value,
        )
        session.add(old_ver)
        session.add(new_ver)
        await session.flush()
        inst = HermesInstance(
            name="rollout",
            profile_name="rollout",
            runtime_version_id=old_ver.id,
            gateway_port=19802,
            status=InstanceStatus.STOPPED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id
        new_ver_id = new_ver.id

    update = UpdateService(settings, session_maker)
    update._install.run_job = AsyncMock(
        return_value={
            "version": "0.20.0",
            "resolvedVersion": "0.20.0",
            "realExecutableVerified": True,
            "stub": False,
        }
    )
    update._gateway.stop_instance = AsyncMock()
    update._gateway.start_instance = AsyncMock()
    update._probe_instance = AsyncMock()
    update._cleanup_old_versions = AsyncMock()

    job = RuntimeJob(job_type="update", status="running")
    progress = AsyncMock()

    await update.run_job(job, {"version": "0.20.0"}, progress)

    update._gateway.stop_instance.assert_awaited_once_with(instance_id)
    update._gateway.start_instance.assert_awaited_once_with(instance_id)
    update._probe_instance.assert_awaited_once_with(instance_id)

    async with session_maker() as session:
        inst = await session.get(HermesInstance, instance_id)
        assert inst is not None
        assert inst.runtime_version_id == new_ver_id
        active = (
            await session.execute(
                select(RuntimeVersion).where(RuntimeVersion.status == RuntimeVersionStatus.ACTIVE.value)
            )
        ).scalar_one()
        assert active.id == new_ver_id
        assert active.version == "0.20.0"


@pytest.mark.asyncio
# @lat: [[tests#Transactional update#Restores binding on failure]]
async def test_update_failure_restores_instance_binding(app_client) -> None:
    client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        old_ver = RuntimeVersion(
            version="0.19.0",
            channel="stable",
            install_path="/tmp/old",
            executable_path=sys.executable,
            status=RuntimeVersionStatus.ACTIVE.value,
        )
        new_ver = RuntimeVersion(
            version="0.20.0",
            channel="stable",
            install_path="/tmp/new",
            executable_path=sys.executable,
            status=RuntimeVersionStatus.INSTALLED.value,
        )
        session.add(old_ver)
        session.add(new_ver)
        await session.flush()
        inst = HermesInstance(
            name="restore",
            profile_name="restore",
            runtime_version_id=old_ver.id,
            gateway_port=19803,
            status=InstanceStatus.STOPPED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()
        instance_id = inst.id
        old_ver_id = old_ver.id

    update = UpdateService(settings, session_maker)
    update._install.run_job = AsyncMock(
        return_value={
            "version": "0.20.0",
            "resolvedVersion": "0.20.0",
            "realExecutableVerified": True,
            "stub": False,
        }
    )
    update._gateway.stop_instance = AsyncMock()
    update._gateway.start_instance = AsyncMock()
    update._probe_instance = AsyncMock(side_effect=RuntimeServiceError("probe failed", code="gateway_health_failed"))
    update._cleanup_old_versions = AsyncMock()

    job = RuntimeJob(job_type="update", status="running")
    progress = AsyncMock()

    with pytest.raises(RuntimeServiceError):
        await update.run_job(job, {"version": "0.20.0"}, progress)

    async with session_maker() as session:
        inst = await session.get(HermesInstance, instance_id)
        assert inst is not None
        assert inst.runtime_version_id == old_ver_id
        active = (
            await session.execute(
                select(RuntimeVersion).where(RuntimeVersion.status == RuntimeVersionStatus.ACTIVE.value)
            )
        ).scalar_one()
        assert active.id == old_ver_id


@pytest.mark.asyncio
# @lat: [[tests#Transactional update#Rejects pinned delete]]
async def test_cleanup_rejects_pinned_version(app_client) -> None:
    _client, _supervisor, settings, _hub, app = app_client
    session_maker = create_sessionmaker(app.state.engine)

    async with session_maker() as session:
        ver = RuntimeVersion(
            version="0.19.0-pinned",
            channel="stable",
            install_path=str(settings.resolved_runtime_data_dir() / "versions" / "pinned"),
            executable_path=sys.executable,
            status=RuntimeVersionStatus.ACTIVE.value,
        )
        session.add(ver)
        await session.flush()
        inst = HermesInstance(
            name="pinned",
            profile_name="pinned",
            runtime_version_id=ver.id,
            gateway_port=19804,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=False,
        )
        session.add(inst)
        await session.commit()

    resp = await _client.delete("/api/v1/runtime/versions/0.19.0-pinned")
    assert resp.status_code == 409
    body = resp.json()
    err = body.get("error") or body
    assert err.get("code") == "runtime_version_pinned"

    async with session_maker() as session:
        pin = RuntimeVersionPinService(session)
        row = await session.execute(select(RuntimeVersion).where(RuntimeVersion.version == "0.19.0-pinned"))
        version_row = row.scalar_one()
        assert await pin.pin_reason(version_row) == "active"


@pytest.mark.asyncio
# @lat: [[tests#Transactional update#Terminates pip subprocess]]
async def test_job_cancel_terminates_pip(test_settings: Settings) -> None:
    from db.session import create_engine, create_sessionmaker, init_db

    engine = create_engine(test_settings)
    await init_db(engine)
    session_maker = create_sessionmaker(engine)

    install = InstallationService(test_settings, session_maker)
    token = CancellationToken()
    killed = {"value": False}

    mock_proc = MagicMock()
    mock_proc.returncode = None

    async def slow_communicate() -> tuple[bytes, bytes]:
        await asyncio.sleep(5)
        return b"", b""

    mock_proc.communicate = slow_communicate
    mock_proc.kill = lambda: killed.update(value=True)
    mock_proc.wait = AsyncMock(return_value=0)

    venv_dir = Path(test_settings.resolved_runtime_data_dir()) / "venv-cancel-test"
    venv_scripts = venv_dir / "Scripts"
    venv_scripts.mkdir(parents=True, exist_ok=True)
    (venv_scripts / "python.exe").write_text("", encoding="utf-8")
    package_path = Path(test_settings.resolved_runtime_data_dir()) / "pkg"
    package_path.mkdir(parents=True, exist_ok=True)
    (package_path / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")

    async def cancel_after_delay() -> None:
        await asyncio.sleep(0.05)
        token.cancel()

    with patch("services.installation_service.asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):
        cancel_task = asyncio.create_task(cancel_after_delay())
        with pytest.raises(JobCancelled):
            await install._pip_install(venv_dir, package_path, token)
        await cancel_task

    assert killed["value"] is True
