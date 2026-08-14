from __future__ import annotations

from dataclasses import dataclass
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
from services.control import ActionService, DiagnosticService, InventoryService, PolicyService


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
        policies=PolicyService(actions),
        diagnostics=DiagnosticService(repos),
    )


def build_production_state(settings: Settings) -> AppState:
    settings.assert_production_safe()
    engine = create_engine(settings.database_url)
    factory = create_session_factory(engine)
    repos = build_sqlalchemy_repos(factory)
    rpc = HttpOpsiJsonRpc(settings)
    inventory = InventoryService(rpc, settings.product_id)
    actions = ActionService(repos, rpc, settings)
    return AppState(
        settings=settings,
        repos=repos,
        rpc=rpc,
        inventory=inventory,
        actions=actions,
        policies=PolicyService(actions),
        diagnostics=DiagnosticService(repos),
        session_factory=factory,
        engine=engine,
    )


def create_app(state: AppState | None = None) -> FastAPI:
    configure_logging()
    cfg = (state.settings if state else None) or get_settings()
    app = FastAPI(title="SMC OPSI Control", version="1.0.0")
    if state is None:
        if cfg.opsi_env in {"test", "lab"}:
            state = build_test_state(cfg)
        else:
            state = build_production_state(cfg)
    app.state.settings = state.settings
    app.state.repos = state.repos
    app.state.rpc = state.rpc
    app.state.inventory = state.inventory
    app.state.actions = state.actions
    app.state.policies = state.policies
    app.state.diagnostics = state.diagnostics
    app.include_router(api_router)

    @app.exception_handler(OpsiControlError)
    async def _opsi_error(_request: Request, exc: OpsiControlError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc))

    return app
