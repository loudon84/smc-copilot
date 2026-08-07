from __future__ import annotations

import os
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.config import get_settings
from core.logging import configure_logging, get_logger
from db.session import create_engine, create_sessionmaker
from integrations.service_center import create_service_center_client
from integrations.team_hub.client import HttpTeamHubClient, StubTeamHubClient
from local_service.service_state import mark_service_boot
from runtime.process_lock import ProcessLock, RuntimeAlreadyRunningError
from services.gateway_supervisor import GatewaySupervisor
from services.runtime_job_service import RuntimeJobService
from services.task_routing_registry import TaskRoutingRegistry
from workers.ack_delivery_worker import AckDeliveryWorker
from workers.artifact_delivery_worker import ArtifactDeliveryWorker
from workers.assignment_worker import AssignmentWorker
from workers.delivery_outbox_worker import DeliveryOutboxWorker
from workers.desired_state_worker import DesiredStateWorker
from workers.endpoint_heartbeat_worker import EndpointHeartbeatWorker
from workers.lease_renewal_worker import LeaseRenewalWorker
from workers.registry import WorkerRegistration
from workers.retention_worker import RetentionWorker
from workers.staffdeck_review_worker import StaffDeckReviewWorker
from workers.supervisor import WorkerSupervisor
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


async def _endpoint_workers_enabled(settings, session_maker, center) -> bool:
    if settings.service_center_use_stub:
        return True
    try:
        from db.repositories.endpoint_sync_repo import EndpointSyncRepository

        async with session_maker() as session:
            repo = EndpointSyncRepository(session)
            cred = await repo.get_credential()
            return bool(cred and cred.status == "active")
    except Exception:
        logger.exception("endpoint_worker_gate_failed")
        return False


def _register_runtime_handlers(job_service: RuntimeJobService, settings, session_maker) -> None:
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

        from services.bootstrap_service import BootstrapService

        bootstrap = BootstrapService(settings, session_maker=session_maker)
        job_service.register_handler("bootstrap", bootstrap.run_job)
    except ImportError:
        logger.warning("runtime_handlers_partial", reason="some runtime services not yet available")


def _tick_fn(worker: object) -> Callable[[], Awaitable[None]]:
    if hasattr(worker, "tick"):

        async def tick() -> None:
            await worker.tick()  # type: ignore[attr-defined]

        return tick

    async def tick() -> None:
        await worker._tick()  # type: ignore[attr-defined]

    return tick


def _build_supervisor(
    settings,
    session_maker,
    center,
    gateway_supervisor: GatewaySupervisor,
    hub,
    registry,
    *,
    endpoint_enabled: bool,
) -> WorkerSupervisor:
    ws = WorkerSupervisor()
    # Team Hub is deprecated compatibility; only start when explicitly enabled.
    team_hub_enabled = bool((settings.team_hub_base_url or "").strip()) or bool(
        getattr(settings, "team_hub_compat_enabled", False)
    )
    if team_hub_enabled:
        ws.register(
            WorkerRegistration(
                name="TaskListenerWorker",
                tick=_tick_fn(
                    TaskListenerWorker(
                        settings=settings,
                        session_maker=session_maker,
                        supervisor=gateway_supervisor,
                        hub=hub,
                        routing=registry,
                        center=center,
                    )
                ),
                interval_seconds=settings.task_poll_interval_seconds,
            )
        )
        ws.register(
            WorkerRegistration(
                name="SyncOutboxWorker",
                tick=_tick_fn(SyncOutboxWorker(settings=settings, session_maker=session_maker, hub=hub)),
                interval_seconds=settings.sync_outbox_interval_seconds,
            )
        )
    ws.register(
        WorkerRegistration(
            name="RunEventWorker",
            tick=_tick_fn(RunEventWorker(settings=settings, session_maker=session_maker)),
            interval_seconds=settings.run_event_poll_interval_seconds,
        )
    )
    if endpoint_enabled:
        ws.register(
            WorkerRegistration(
                name="EndpointHeartbeatWorker",
                tick=_tick_fn(EndpointHeartbeatWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.endpoint_heartbeat_interval_seconds,
                critical=True,
            )
        )
        ws.register(
            WorkerRegistration(
                name="DeliveryOutboxWorker",
                tick=_tick_fn(DeliveryOutboxWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.delivery_outbox_interval_seconds,
                critical=True,
            )
        )
        ws.register(
            WorkerRegistration(
                name="AckDeliveryWorker",
                tick=_tick_fn(AckDeliveryWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.delivery_outbox_interval_seconds,
                critical=True,
            )
        )
        ws.register(
            WorkerRegistration(
                name="DesiredStateWorker",
                tick=_tick_fn(DesiredStateWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.sync_poll_interval_seconds,
            )
        )
        ws.register(
            WorkerRegistration(
                name="AssignmentWorker",
                tick=_tick_fn(
                    AssignmentWorker(
                        settings=settings,
                        session_maker=session_maker,
                        center=center,
                        supervisor=gateway_supervisor,
                    )
                ),
                interval_seconds=settings.sync_poll_interval_seconds,
            )
        )
        ws.register(
            WorkerRegistration(
                name="StaffDeckReviewWorker",
                tick=_tick_fn(StaffDeckReviewWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.sync_poll_interval_seconds,
            )
        )
        ws.register(
            WorkerRegistration(
                name="ArtifactDeliveryWorker",
                tick=_tick_fn(ArtifactDeliveryWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=settings.delivery_outbox_interval_seconds,
            )
        )
        ws.register(
            WorkerRegistration(
                name="LeaseRenewalWorker",
                tick=_tick_fn(LeaseRenewalWorker(settings=settings, session_maker=session_maker, center=center)),
                interval_seconds=getattr(settings, "lease_renewal_interval_seconds", 30.0),
                critical=True,
            )
        )
    ws.register(
        WorkerRegistration(
            name="RetentionWorker",
            tick=_tick_fn(RetentionWorker(settings=settings)),
            interval_seconds=getattr(settings, "retention_interval_seconds", 3600.0),
        )
    )
    return ws


# @lat: [[architecture#生命周期与后台循环]]
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    mark_service_boot()
    settings = get_settings()

    try:
        from core.deployment_mode import validate_deployment_mode

        mode = validate_deployment_mode(settings)
        logger.info("deployment_mode", mode=mode.value)
    except Exception as exc:
        from core.deployment_mode import DeploymentModeError

        if isinstance(exc, DeploymentModeError):
            logger.error("deployment_mode_invalid", code=exc.code, error=str(exc))
            raise SystemExit(2) from exc
        raise

    process_lock: ProcessLock | None = None
    if not bool(getattr(app.state, "_skip_process_lock", False)):
        process_lock = ProcessLock.for_data_dir(settings.resolved_runtime_data_dir())
        try:
            process_lock.acquire()
        except RuntimeAlreadyRunningError:
            logger.error("runtime_already_running")
            raise SystemExit(3) from None

    injected_engine = getattr(app.state, "_test_engine", None)
    engine = injected_engine if injected_engine is not None else create_engine(settings)
    session_maker = create_sessionmaker(engine)

    supervisor = getattr(app.state, "_test_gateway_supervisor", None) or GatewaySupervisor(
        settings=settings, session_maker=session_maker
    )
    registry = getattr(app.state, "_test_task_routing_registry", None) or TaskRoutingRegistry(settings)
    hub = getattr(app.state, "_test_team_hub", None) or _hub_factory(settings)
    center = getattr(app.state, "_test_service_center", None) or create_service_center_client(settings)

    job_service = getattr(app.state, "_test_runtime_job_service", None)
    if job_service is None:
        job_service = RuntimeJobService(settings, session_maker)
        _register_runtime_handlers(job_service, settings, session_maker)

    worker_supervisor: WorkerSupervisor | None = getattr(app.state, "_test_worker_supervisor", None)

    app.state.engine = engine
    app.state.session_maker = session_maker
    app.state.gateway_supervisor = supervisor
    app.state.team_hub = hub
    app.state.service_center = center
    app.state.task_routing_registry = registry

    async with session_maker() as session:
        await registry.load_from_db(session)
    app.state.runtime_job_service = job_service
    app.state.process_lock = process_lock

    bootstrap_token = (os.environ.get("RUNTIME_BOOTSTRAP_TOKEN") or "").strip()
    if bootstrap_token:
        from services.bootstrap_service import BootstrapService

        async with session_maker() as session:
            await BootstrapService(settings, session).register_token(bootstrap_token)
            await session.commit()
        logger.info("bootstrap_token_registered")

    recovered = await job_service.recover_incomplete_jobs()
    if recovered:
        logger.info("runtime_jobs_recovered", count=recovered)

    if not bool(getattr(app.state, "_disable_workers", False)):
        try:
            from services.chat_turn_recovery import recover_chat_turns

            await recover_chat_turns(session_maker)
        except Exception:
            logger.exception("chat_turn_recovery_failed")
        try:
            from runtime.tasks.task_recovery_service import recover_task_runtime

            await recover_task_runtime(
                session_maker,
                settings=settings,
                supervisor=supervisor,
                center=center,
            )
        except Exception:
            logger.exception("task_runtime_recovery_failed")
    else:
        from services.chat_turn_scheduler import ChatTurnScheduler

        ChatTurnScheduler.configure(session_maker)
        try:
            from runtime.tasks.task_worker_manager import TaskWorkerManager

            TaskWorkerManager.configure(
                settings=settings,
                session_maker=session_maker,
                center=center,
                supervisor=supervisor,
            )
        except Exception:
            logger.exception("task_worker_manager_configure_failed")

    if not bool(getattr(app.state, "_disable_gateway_autostart", False)):
        await supervisor.reconcile_instances_on_boot()
        await supervisor.reconcile_legacy_profiles_on_boot()
        await supervisor.start_auto_start_instances()
        await supervisor.start_auto_start_profiles()

    disable_workers = bool(getattr(app.state, "_disable_workers", False))
    await job_service.start_worker()

    if not disable_workers:
        endpoint_enabled = await _endpoint_workers_enabled(settings, session_maker, center)
        if worker_supervisor is None:
            worker_supervisor = _build_supervisor(
                settings,
                session_maker,
                center,
                supervisor,
                hub,
                registry,
                endpoint_enabled=endpoint_enabled,
            )
        app.state.worker_supervisor = worker_supervisor
        await worker_supervisor.start_all()

    logger.info(
        "copilot_serve_started",
        host=settings.bind_host,
        port=settings.bind_port,
        workers=not disable_workers,
    )

    yield

    if worker_supervisor is not None:
        await worker_supervisor.drain()
    await job_service.stop_worker()
    await supervisor.shutdown_all_instances()
    await supervisor.shutdown_all_legacy_profiles()
    if process_lock is not None:
        process_lock.release()
    await engine.dispose()
    logger.info("copilot_serve_stopped")
