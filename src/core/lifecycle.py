from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.config import get_settings
from core.logging import configure_logging, get_logger
from db.session import create_engine, create_sessionmaker
from integrations.team_hub.client import HttpTeamHubClient, StubTeamHubClient
from local_service.service_state import mark_service_boot
from services.gateway_supervisor import GatewaySupervisor
from services.runtime_job_service import RuntimeJobService
from services.task_routing_registry import TaskRoutingRegistry
from workers.v12_workers import RunEventWorker, SyncOutboxWorker, TaskListenerWorker

logger = get_logger(__name__)


def _hub_factory(settings) -> StubTeamHubClient | HttpTeamHubClient:
    if settings.team_hub_use_stub or not (settings.team_hub_base_url or "").strip():
        return StubTeamHubClient()
    return HttpTeamHubClient(
        settings.team_hub_base_url,
        settings.team_hub_token or "",
        settings.device_id,
        settings.agent_id,
    )


def _register_runtime_handlers(job_service: RuntimeJobService, settings, session_maker) -> None:
    """Wire install/update/rollback/doctor handlers (lazy import to avoid circular deps)."""
    try:
        from services.doctor_service import DoctorService
        from services.installation_service import InstallationService
        from services.rollback_service import RollbackService
        from services.update_service import UpdateService

        install = InstallationService(settings, session_maker)
        update = UpdateService(settings, session_maker)
        rollback = RollbackService(settings, session_maker)
        doctor = DoctorService(settings, session_maker)

        job_service.register_handler("install", install.run_job)
        job_service.register_handler("update", update.run_job)
        job_service.register_handler("rollback", rollback.run_job)
        job_service.register_handler("doctor", doctor.run_job)
    except ImportError:
        logger.warning("runtime_handlers_partial", reason="some runtime services not yet available")


# @lat: [[architecture#生命周期与后台循环]]
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    mark_service_boot()
    settings = get_settings()

    # 生产环境仅通过 Alembic 建表/迁移；测试在 conftest 中调用 init_db(create_all)
    injected_engine = getattr(app.state, "_test_engine", None)
    engine = injected_engine if injected_engine is not None else create_engine(settings)

    session_maker = create_sessionmaker(engine)

    injected_supervisor = getattr(app.state, "_test_gateway_supervisor", None)
    if injected_supervisor is not None:
        supervisor = injected_supervisor
    else:
        supervisor = GatewaySupervisor(settings=settings, session_maker=session_maker)

    registry = getattr(app.state, "_test_task_routing_registry", None) or TaskRoutingRegistry(settings)

    injected_hub = getattr(app.state, "_test_team_hub", None)
    hub = injected_hub if injected_hub is not None else _hub_factory(settings)

    job_service = getattr(app.state, "_test_runtime_job_service", None)
    if job_service is None:
        job_service = RuntimeJobService(settings, session_maker)
        _register_runtime_handlers(job_service, settings, session_maker)

    app.state.engine = engine
    app.state.session_maker = session_maker
    app.state.gateway_supervisor = supervisor
    app.state.team_hub = hub
    app.state.task_routing_registry = registry
    app.state.runtime_job_service = job_service

    recovered = await job_service.recover_incomplete_jobs()
    if recovered:
        logger.info("runtime_jobs_recovered", count=recovered)

    disable_gateway_autostart = bool(getattr(app.state, "_disable_gateway_autostart", False))
    if not disable_gateway_autostart:
        # FR-06 boot: recover jobs (above) → reconcile instances → legacy profiles → autostart both
        await supervisor.reconcile_instances_on_boot()
        await supervisor.reconcile_legacy_profiles_on_boot()
        await supervisor.start_auto_start_instances()
        await supervisor.start_auto_start_profiles()

    bg_tasks: list[asyncio.Task[None]] = []
    disable_workers = bool(getattr(app.state, "_disable_workers", False))

    await job_service.start_worker()

    if not disable_workers:
        listener = TaskListenerWorker(
            settings=settings, session_maker=session_maker, supervisor=supervisor, hub=hub, routing=registry
        )
        syncer = SyncOutboxWorker(settings=settings, session_maker=session_maker, hub=hub)
        run_ev = RunEventWorker(settings=settings, session_maker=session_maker)
        bg_tasks = [
            asyncio.create_task(listener.run_forever()),
            asyncio.create_task(syncer.run_forever()),
            asyncio.create_task(run_ev.run_forever()),
        ]

    logger.info(
        "copilot_serve_started",
        host=settings.bind_host,
        port=settings.bind_port,
        workers=not disable_workers,
    )

    yield

    await job_service.stop_worker()

    for t in bg_tasks:
        t.cancel()
    if bg_tasks:
        await asyncio.gather(*bg_tasks, return_exceptions=True)

    # FR-06 shutdown: instances then legacy profiles
    await supervisor.shutdown_all_instances()
    await supervisor.shutdown_all_legacy_profiles()
    await engine.dispose()
    logger.info("copilot_serve_stopped")
