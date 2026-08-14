from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.router import api_router
from core.config import Settings, get_settings
from core.errors import OpsiControlError, error_body
from core.logging import configure_logging
from db.repositories.interfaces import RepositoryBundle
from db.repositories.memory import build_in_memory_repos
from db.repositories.sqlalchemy import build_sqlalchemy_repos
from db.session import create_engine, create_session_factory
from integrations.opsi_http import HttpOpsiJsonRpc
from integrations.opsi_jsonrpc import FakeOpsiJsonRpc, OpsiJsonRpc
from integrations.secret_provider import EnvSecretProvider, HttpSecretProvider, SecretProvider
from services.control import ActionService, DiagnosticService, InventoryService, PolicyService
from workers.runtime import WorkerRuntime


@dataclass
class AppState:
    settings: Settings
    repos: RepositoryBundle
    rpc: OpsiJsonRpc
    inventory: InventoryService
    actions: ActionService
    policies: PolicyService
    diagnostics: DiagnosticService
    session_factory: Any | None = None
    engine: Any | None = None
    secrets: SecretProvider | None = None
    worker_stop: asyncio.Event | None = None
    worker_tasks: list[asyncio.Task] = field(default_factory=list)


def build_test_state(settings: Settings | None = None) -> AppState:
    cfg = settings or Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32")
    if cfg.opsi_env not in {"test", "lab"}:
        raise ValueError("build_test_state requires opsi_env=test|lab")
    repos = build_in_memory_repos()
    rpc = FakeOpsiJsonRpc()
    inventory = InventoryService(rpc, cfg.product_id)
    actions = ActionService(repos, rpc, cfg)
    return AppState(
        settings=cfg,
        repos=repos,
        rpc=rpc,
        inventory=inventory,
        actions=actions,
        policies=PolicyService(actions, repos),
        diagnostics=DiagnosticService(repos),
        secrets=EnvSecretProvider(),
    )


def build_production_state(settings: Settings) -> AppState:
    settings.assert_production_safe()
    engine = create_engine(settings.database_url)
    factory = create_session_factory(engine)
    repos = build_sqlalchemy_repos(factory)
    secrets = HttpSecretProvider(settings.secret_provider_url)
    rpc = HttpOpsiJsonRpc(settings, secrets=secrets)
    if type(rpc).__name__.startswith("Fake"):
        raise ValueError("Fake RPC forbidden in production")
    inventory = InventoryService(rpc, settings.product_id)
    actions = ActionService(repos, rpc, settings)
    return AppState(
        settings=settings,
        repos=repos,
        rpc=rpc,
        inventory=inventory,
        actions=actions,
        policies=PolicyService(actions, repos),
        diagnostics=DiagnosticService(repos),
        session_factory=factory,
        engine=engine,
        secrets=secrets,
    )


def create_app(state: AppState | None = None) -> FastAPI:
    configure_logging()
    cfg = (state.settings if state else None) or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app_state: AppState = app.state.container
        start = app_state.settings.start_workers and app_state.settings.opsi_env != "test"
        start = start and app_state.settings.worker_mode == "lifespan"
        tasks: list[asyncio.Task] = []
        stop = asyncio.Event()
        app_state.worker_stop = stop
        if start:
            runtime = WorkerRuntime(repos=app_state.repos, rpc=app_state.rpc, settings=app_state.settings, stop=stop)
            tasks = [
                asyncio.create_task(runtime.run_dispatcher(), name="opsi-dispatcher"),
                asyncio.create_task(runtime.run_reconciler(), name="opsi-reconciler"),
            ]
            app_state.worker_tasks = tasks
        yield
        stop.set()
        for task in tasks:
            task.cancel()
        rpc = app_state.rpc
        closer = getattr(rpc, "aclose", None)
        if closer:
            await closer()
        secrets = app_state.secrets
        secret_close = getattr(secrets, "aclose", None)
        if secret_close:
            await secret_close()

    app = FastAPI(title="SMC OPSI Control", version="1.1.0", lifespan=lifespan)
    if state is None:
        if cfg.opsi_env in {"test", "lab"}:
            state = build_test_state(cfg)
        else:
            state = build_production_state(cfg)
    app.state.container = state
    app.state.settings = state.settings
    app.state.repos = state.repos
    app.state.rpc = state.rpc
    app.state.inventory = state.inventory
    app.state.actions = state.actions
    app.state.policies = state.policies
    app.state.diagnostics = state.diagnostics
    app.state.engine = state.engine
    app.state.secrets = state.secrets
    app.include_router(api_router)

    @app.exception_handler(OpsiControlError)
    async def _opsi_error(_request: Request, exc: OpsiControlError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc))

    return app
