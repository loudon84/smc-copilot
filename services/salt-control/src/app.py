from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.router import api_router
from core.config import Settings, get_settings
from core.errors import SaltControlError, error_body
from core.idempotency import IdempotencyStore
from db.repositories.interfaces import RepositoryBundle
from db.repositories.memory import build_in_memory_repos
from integrations.artifact_store import ArtifactStore, FakeArtifactStore
from integrations.management_backend import FakeManagementBackend, ManagementBackend
from integrations.salt_master import FakeSaltMaster, SaltMaster
from integrations.secret_provider import FakeSecretProvider, SecretProvider
from services.artifact_service import ArtifactService
from services.desired_state_service import DesiredStateService
from services.enrollment_service import EnrollmentService
from services.return_service import ReturnService
from services.rollout_service import RolloutService
from services.secret_service import SecretService


@dataclass
class AppState:
    settings: Settings
    repos: RepositoryBundle
    idempotency: IdempotencyStore
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


def build_default_state(settings: Settings | None = None) -> AppState:
    cfg = settings or get_settings()
    repos = build_in_memory_repos()
    idempotency = IdempotencyStore()
    backend = FakeManagementBackend()
    masters: list[SaltMaster] = [
        FakeSaltMaster(name="salt-a"),
        FakeSaltMaster(name="salt-b"),
    ]
    secret_provider: SecretProvider = FakeSecretProvider()
    artifact_store: ArtifactStore = FakeArtifactStore()
    return AppState(
        settings=cfg,
        repos=repos,
        idempotency=idempotency,
        backend=backend,
        masters=masters,
        secret_provider=secret_provider,
        artifact_store=artifact_store,
        enrollment_service=EnrollmentService(repos, cfg, masters),
        desired_state_service=DesiredStateService(repos, backend),
        return_service=ReturnService(repos),
        secret_service=SecretService(repos, secret_provider, idempotency),
        artifact_service=ArtifactService(repos, artifact_store),
        rollout_service=RolloutService(repos, idempotency),
    )


def create_app(
    *,
    settings: Settings | None = None,
    state: AppState | None = None,
) -> FastAPI:
    app_state = state or build_default_state(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = app_state
        yield

    app = FastAPI(
        title="SMC Salt Control",
        version="1.0.0",
        lifespan=lifespan,
    )
    # Attach immediately so OpenAPI export / tests without lifespan still work
    app.state.container = app_state
    for key, value in _state_as_mapping(app_state).items():
        setattr(app.state, key, value)

    @app.exception_handler(SaltControlError)
    async def handle_salt_error(_request: Request, exc: SaltControlError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc))

    app.include_router(api_router)
    return app


def _state_as_mapping(state: AppState) -> dict[str, Any]:
    return {
        "settings": state.settings,
        "repos": state.repos,
        "idempotency": state.idempotency,
        "backend": state.backend,
        "masters": state.masters,
        "secret_provider": state.secret_provider,
        "artifact_store": state.artifact_store,
        "enrollment_service": state.enrollment_service,
        "desired_state_service": state.desired_state_service,
        "return_service": state.return_service,
        "secret_service": state.secret_service,
        "artifact_service": state.artifact_service,
        "rollout_service": state.rollout_service,
    }
