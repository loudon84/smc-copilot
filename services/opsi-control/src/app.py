from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.router import api_router
from core.config import Settings, get_settings
from core.errors import OpsiControlError, error_body
from core.logging import configure_logging
from db.repositories.interfaces import RepositoryBundle
from db.repositories.inventory_sql import SqlInventoryStore
from db.repositories.memory import build_in_memory_repos
from db.repositories.rollout_memory import MemoryRolloutStore
from db.repositories.rollout_sql import SqlRolloutStore
from db.repositories.sqlalchemy import build_sqlalchemy_repos
from db.session import create_engine, create_session_factory
from domain.collector import InventoryCollector, InventoryStore, MemoryInventoryStore
from domain.inventory import EndpointBindingRecord, snapshot_from_parts
from integrations.opsi_http import HttpOpsiJsonRpc
from integrations.opsi_jsonrpc import FakeOpsiJsonRpc, OpsiJsonRpc
from integrations.secret_provider import EnvSecretProvider, HttpSecretProvider, SecretProvider
from services.control import ActionService, DiagnosticService, InventoryService, PolicyService
from services.rollout import RolloutService
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
    rollouts: RolloutService
    inventory_store: InventoryStore
    collector: InventoryCollector
    session_factory: Any | None = None
    engine: Any | None = None
    secrets: SecretProvider | None = None
    worker_stop: asyncio.Event | None = None
    worker_tasks: list[asyncio.Task] = field(default_factory=list)


def _assert_rpc_kind(rpc: OpsiJsonRpc, *, allow_fake: bool) -> None:
    name = type(rpc).__name__
    if name.startswith("Fake") and not allow_fake:
        raise ValueError("Fake RPC forbidden outside test")
    if not name.startswith("Fake") and allow_fake:
        raise ValueError("test assembly requires FakeOpsiJsonRpc")


def _seed_installed_inventory(store: MemoryInventoryStore, rpc: FakeOpsiJsonRpc) -> None:
    now = datetime.now(UTC)
    for host in rpc.hosts:
        client_id = str(host["id"])
        binding = EndpointBindingRecord(
            client_id=client_id,
            user_sid="S-1-5-21-1-2-3-1001",
            user_account="lab\\user-a",
            evidence_ref="test://binding",
            revision=1,
            approved_by="test-fixture",
            observed_at=now,
            reason="test seed",
            change_ticket="CHG-TEST",
        )
        store.bindings[client_id] = binding
        store.evidence[client_id] = {
            "os": "windows11",
            "lastSeenMinutes": 5,
            "owner": "opsi",
            "diskFreeMb": 4096,
            "userSid": binding.user_sid,
            "userAccount": binding.user_account,
            "gatewayHealthy": True,
            "previousVersion": "0.21.0",
            "previousDigest": "ab" * 32,
            "bindingSource": "operator-evidence",
            "workSmokeRef": "test://work-smoke",
            "cliPath": r"C:\ProgramData\SMC\hermes\versions\current\hermes.exe",
            "cliVersion": "0.21.0",
            "bootstrapTask": "SMC-Hermes-User-Bootstrap-S-1-5-21-1-2-3-1001",
            "gatewayTask": "SMC-Hermes-Gateway-S-1-5-21-1-2-3-1001",
        }


def build_test_state(settings: Settings | None = None) -> AppState:
    cfg = settings or Settings(opsi_env="test", jwt_lab_secret="test-secret-test-secret-test-sec32")
    if cfg.opsi_env != "test":
        raise ValueError("build_test_state requires opsi_env=test")
    repos = build_in_memory_repos()
    rpc = FakeOpsiJsonRpc()
    _assert_rpc_kind(rpc, allow_fake=True)
    inventory_store = MemoryInventoryStore()
    _seed_installed_inventory(inventory_store, rpc)
    collector = InventoryCollector(rpc, inventory_store)
    now = datetime.now(UTC)
    for host in rpc.hosts:
        client_id = str(host["id"])
        snap = snapshot_from_parts(
            client_id=client_id,
            rpc_host=host,
            depot_id=rpc.depot_mapping[client_id],
            binding=inventory_store.bindings[client_id],
            evidence=inventory_store.evidence[client_id],
            now=now,
        )
        if snap:
            inventory_store.snapshots[client_id] = snap
    inventory = InventoryService(rpc, cfg.product_id, store=inventory_store, collector=collector)
    actions = ActionService(repos, rpc, cfg)
    store = MemoryRolloutStore()
    if type(store).__name__.find("Sql") >= 0:
        raise ValueError("test assembly forbids SQL store")
    rollouts = RolloutService(store, rpc, cfg, actions, inventory=inventory_store)
    for host in rpc.hosts:
        rollouts.facts.setdefault(str(host["id"]), {})
    return AppState(
        settings=cfg,
        repos=repos,
        rpc=rpc,
        inventory=inventory,
        actions=actions,
        policies=PolicyService(actions, repos),
        diagnostics=DiagnosticService(repos),
        secrets=EnvSecretProvider(),
        rollouts=rollouts,
        inventory_store=inventory_store,
        collector=collector,
    )


def build_real_state(settings: Settings, *, auth_mode: str, secret_mode: str) -> AppState:
    if settings.opsi_env == "test":
        raise ValueError("build_real_state refuses test env")
    if not settings.database_url.startswith("postgresql"):
        raise ValueError("real assembly requires postgresql")
    engine = create_engine(settings.database_url)
    factory = create_session_factory(engine)
    repos = build_sqlalchemy_repos(factory)
    if type(repos.actions).__name__.startswith("Memory"):
        raise ValueError("Memory repository forbidden outside test")
    if secret_mode == "env":
        secrets: SecretProvider = EnvSecretProvider()
    else:
        secrets = HttpSecretProvider(settings.secret_provider_url)
    rpc = HttpOpsiJsonRpc(settings, secrets=secrets)
    _assert_rpc_kind(rpc, allow_fake=False)
    inventory_store = SqlInventoryStore(factory)
    collector = InventoryCollector(rpc, inventory_store)
    inventory = InventoryService(rpc, settings.product_id, store=inventory_store, collector=collector)
    actions = ActionService(repos, rpc, settings)
    store = SqlRolloutStore(factory)
    rollouts = RolloutService(store, rpc, settings, actions, inventory=inventory_store)
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
        rollouts=rollouts,
        inventory_store=inventory_store,
        collector=collector,
    )


def build_lab_state(settings: Settings) -> AppState:
    if settings.opsi_env != "lab":
        raise ValueError("build_lab_state requires opsi_env=lab")
    settings.assert_lab_safe()
    state = build_real_state(settings, auth_mode="lab-jwt", secret_mode="env")
    if type(state.rpc).__name__.startswith("Fake"):
        raise ValueError("Fake RPC forbidden in lab")
    if type(state.repos.actions).__name__.startswith("Memory"):
        raise ValueError("Memory persistence forbidden in lab")
    return state


def build_production_state(settings: Settings) -> AppState:
    if settings.opsi_env != "production":
        raise ValueError("build_production_state requires opsi_env=production")
    settings.assert_production_safe()
    return build_real_state(settings, auth_mode="oidc", secret_mode="http")


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
                asyncio.create_task(runtime.run_rollout(app_state.rollouts), name="opsi-rollout"),
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

    app = FastAPI(title="SMC OPSI Control", version="1.5.0", lifespan=lifespan)
    if state is None:
        if cfg.opsi_env == "test":
            state = build_test_state(cfg)
        elif cfg.opsi_env == "lab":
            state = build_lab_state(cfg)
        else:
            state = build_production_state(cfg)
    _assert_rpc_kind(state.rpc, allow_fake=state.settings.opsi_env == "test")
    app.state.container = state
    app.state.settings = state.settings
    app.state.repos = state.repos
    app.state.rpc = state.rpc
    app.state.inventory = state.inventory
    app.state.actions = state.actions
    app.state.policies = state.policies
    app.state.diagnostics = state.diagnostics
    app.state.rollouts = state.rollouts
    app.state.inventory_store = state.inventory_store
    app.state.collector = state.collector
    app.state.engine = state.engine
    app.state.secrets = state.secrets
    app.include_router(api_router)

    @app.exception_handler(OpsiControlError)
    async def _opsi_error(_request: Request, exc: OpsiControlError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc))

    return app
