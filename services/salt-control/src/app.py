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
from db.repositories.sqlalchemy import build_sqlalchemy_repos
from db.session import create_engine, create_session_factory
from integrations.artifact_store import ArtifactStore, FakeArtifactStore
from integrations.artifact_store_http import HttpArtifactStore
from integrations.management_backend import FakeManagementBackend, ManagementBackend
from integrations.management_backend_http import HttpManagementBackend
from integrations.salt_api import SaltApiMaster
from integrations.salt_master import FakeSaltMaster, SaltMaster
from integrations.secret_provider import FakeSecretProvider, SecretProvider
from integrations.secret_provider_http import HttpSecretProvider
from services.artifact_service import ArtifactService
from services.desired_state_service import DesiredStateService
from services.enrollment_service import EnrollmentService
from services.return_service import ReturnService
from services.rollout_service import RolloutService
from services.secret_service import SecretService
from workers.enrollment_worker import EnrollmentOperationWorker


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
    worker: EnrollmentOperationWorker | None = None
    session_factory: Any | None = None
    _boot_session: Any | None = None


def build_test_state(settings: Settings | None = None) -> AppState:
    """InMemory + Fake — pytest / SMC_SALT_ENV=test only."""
    cfg = settings or Settings(salt_env="test", jwt_lab_secret="test-secret")
    if cfg.salt_env not in {"test", "lab"}:
        raise ValueError("build_test_state requires salt_env=test|lab")
    return _build_fake_state(cfg)


def build_lab_state(settings: Settings | None = None) -> AppState:
    """Explicit lab composition — Fake adapters allowed."""
    cfg = settings or get_settings()
    if cfg.salt_env != "lab":
        raise ValueError("build_lab_state requires SMC_SALT_ENV=lab")
    return _build_fake_state(cfg)


def build_production_state(settings: Settings | None = None) -> AppState:
    """PostgreSQL + live adapters — rejects Fake/InMemory."""
    cfg = settings or get_settings()
    if cfg.salt_env != "production":
        raise ValueError("build_production_state requires SMC_SALT_ENV=production")
    cfg.assert_production_safe()

    engine = create_engine(cfg)
    session_factory = create_session_factory(engine)
    boot_session = session_factory()
    repos = build_sqlalchemy_repos(boot_session)
    if type(repos.endpoints).__module__.endswith("memory"):
        raise RuntimeError("production must not use InMemory repositories")

    masters: list[SaltMaster] = []
    for idx, url in enumerate(cfg.salt_api_url_list):
        name = cfg.master_list[idx] if idx < len(cfg.master_list) else f"salt-{idx}"
        masters.append(
            SaltApiMaster(
                name=name,
                api_url=url,
                username=cfg.salt_api_username,
                password=cfg.salt_api_password,
            )
        )
    if not masters:
        raise RuntimeError("production requires at least one salt-api master")
    if any(isinstance(m, FakeSaltMaster) for m in masters):
        raise RuntimeError("production must not use FakeSaltMaster")

    backend: ManagementBackend = HttpManagementBackend(cfg.management_backend_url)
    secret_provider: SecretProvider = HttpSecretProvider(cfg.secret_provider_url)
    artifact_store: ArtifactStore = HttpArtifactStore(cfg.artifact_store_url)
    if isinstance(backend, FakeManagementBackend):
        raise RuntimeError("production must not use FakeManagementBackend")
    if isinstance(secret_provider, FakeSecretProvider):
        raise RuntimeError("production must not use FakeSecretProvider")
    if isinstance(artifact_store, FakeArtifactStore):
        raise RuntimeError("production must not use FakeArtifactStore")

    idempotency = IdempotencyStore()
    worker = EnrollmentOperationWorker(repos, masters)
    return AppState(
        settings=cfg,
        repos=repos,
        idempotency=idempotency,
        backend=backend,
        masters=masters,
        secret_provider=secret_provider,
        artifact_store=artifact_store,
        enrollment_service=EnrollmentService(repos, cfg, masters, worker),
        desired_state_service=DesiredStateService(repos, backend, cfg),
        return_service=ReturnService(repos),
        secret_service=SecretService(repos, secret_provider, idempotency),
        artifact_service=ArtifactService(repos, artifact_store),
        rollout_service=RolloutService(repos, idempotency),
        worker=worker,
        session_factory=session_factory,
        _boot_session=boot_session,
    )


def _build_fake_state(cfg: Settings) -> AppState:
    repos = build_in_memory_repos()
    idempotency = IdempotencyStore()
    backend: ManagementBackend = FakeManagementBackend()
    masters: list[SaltMaster] = [
        FakeSaltMaster(name="salt-a"),
        FakeSaltMaster(name="salt-b"),
    ]
    secret_provider: SecretProvider = FakeSecretProvider()
    artifact_store: ArtifactStore = FakeArtifactStore()
    worker = EnrollmentOperationWorker(repos, masters)
    return AppState(
        settings=cfg,
        repos=repos,
        idempotency=idempotency,
        backend=backend,
        masters=masters,
        secret_provider=secret_provider,
        artifact_store=artifact_store,
        enrollment_service=EnrollmentService(repos, cfg, masters, worker),
        desired_state_service=DesiredStateService(repos, backend, cfg),
        return_service=ReturnService(repos),
        secret_service=SecretService(repos, secret_provider, idempotency),
        artifact_service=ArtifactService(repos, artifact_store),
        rollout_service=RolloutService(repos, idempotency),
        worker=worker,
    )


def build_default_state(settings: Settings | None = None) -> AppState:
    cfg = settings or get_settings()
    if cfg.salt_env == "production":
        return build_production_state(cfg)
    if cfg.salt_env == "lab":
        return build_lab_state(cfg)
    return build_test_state(cfg)


def create_app(
    *,
    settings: Settings | None = None,
    state: AppState | None = None,
) -> FastAPI:
    app_state = state or build_default_state(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = app_state
        if app_state.worker is not None and app_state.settings.salt_env == "production":
            app_state.worker.start()
        yield
        if app_state.worker is not None:
            await app_state.worker.stop()
        for master in app_state.masters:
            close = getattr(master, "close", None)
            if close is not None:
                await close()
        if app_state._boot_session is not None:
            await app_state._boot_session.close()

    app = FastAPI(
        title="SMC Salt Control",
        version="1.0.0",
        lifespan=lifespan,
    )
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
        "worker": state.worker,
    }
