from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from core.config import Settings
from db.repositories.interfaces import RepositoryBundle
from db.unit_of_work import UnitOfWork, unit_of_work
from integrations.artifact_store import ArtifactStore
from integrations.management_backend import ManagementBackend
from integrations.salt_master import SaltMaster
from integrations.secret_provider import SecretProvider
from services.artifact_service import ArtifactService
from services.desired_state_service import DesiredStateService
from services.enrollment_service import EnrollmentService
from services.handover_service import HandoverService
from services.job_service import JobService
from services.return_service import ReturnService
from services.rollout_service import RolloutService
from services.secret_service import SecretService
from workers.enrollment_worker import EnrollmentOperationWorker


@dataclass
class RequestServices:
    """Per-request services bound to a short-lived Unit of Work when PostgreSQL is used."""

    settings: Settings
    repos: RepositoryBundle
    backend: ManagementBackend
    masters: list[SaltMaster]
    secret_provider: SecretProvider
    artifact_store: ArtifactStore
    enrollment_service: EnrollmentService
    desired_state_service: DesiredStateService
    return_service: ReturnService
    secret_service: SecretService
    artifact_service: ArtifactService
    rollout_service: RolloutService
    job_service: JobService
    handover_service: HandoverService
    uow: UnitOfWork | None = None


def build_request_services(
    *,
    settings: Settings,
    repos: RepositoryBundle,
    backend: ManagementBackend,
    masters: list[SaltMaster],
    secret_provider: SecretProvider,
    artifact_store: ArtifactStore,
    uow: UnitOfWork | None = None,
    enrollment_worker: EnrollmentOperationWorker | None = None,
) -> RequestServices:
    job_service = JobService(repos)
    worker = enrollment_worker
    if worker is None:
        worker = EnrollmentOperationWorker(repos=repos, masters=masters)
    return RequestServices(
        settings=settings,
        repos=repos,
        backend=backend,
        masters=masters,
        secret_provider=secret_provider,
        artifact_store=artifact_store,
        enrollment_service=EnrollmentService(repos, settings, masters, worker),
        desired_state_service=DesiredStateService(repos, backend, settings),
        return_service=ReturnService(repos),
        secret_service=SecretService(repos, secret_provider),
        artifact_service=ArtifactService(repos, artifact_store),
        rollout_service=RolloutService(repos),
        job_service=job_service,
        handover_service=HandoverService(job_service),
        uow=uow,
    )


async def get_uow(request: Request) -> AsyncIterator[UnitOfWork | None]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        yield None
        return
    async with unit_of_work(factory) as uow:
        yield uow


async def get_request_services(
    request: Request,
    uow: Annotated[UnitOfWork | None, Depends(get_uow)],
) -> RequestServices:
    container = request.app.state.container
    worker = getattr(container, "worker", None)
    if uow is not None:
        return build_request_services(
            settings=container.settings,
            repos=uow.repos,
            backend=container.backend,
            masters=container.masters,
            secret_provider=container.secret_provider,
            artifact_store=container.artifact_store,
            uow=uow,
            enrollment_worker=worker,
        )
    return build_request_services(
        settings=container.settings,
        repos=container.repos,
        backend=container.backend,
        masters=container.masters,
        secret_provider=container.secret_provider,
        artifact_store=container.artifact_store,
        enrollment_worker=worker,
    )


RequestServicesDep = Annotated[RequestServices, Depends(get_request_services)]
