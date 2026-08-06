from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings, get_settings
from db.repositories.profile_repo import ProfileRepository
from db.repositories.role_spec_repo import RoleSpecRepository
from integrations.team_hub.client import TeamHubClient
from services.gateway_supervisor import GatewaySupervisor
from services.hermes_gateway_client import HermesGatewayService
from services.profile_service import ProfileService
from services.role_library_service import RoleLibraryService
from services.task_routing_registry import TaskRoutingRegistry
from services.task_runtime import TaskRuntimeService

AUTH_WHITELIST = {
    "/api/v1/health",
    "/api/v1/health/live",
    "/api/v1/health/ready",
    "/api/v1/health/details",
    "/api/v1/metrics",
    "/api/v1/pairings/start",
    "/docs",
    "/openapi.json",
    "/redoc",
}

BOOTSTRAP_PREFIX = "/api/v1/bootstrap"


def _is_bootstrap_path(path: str) -> bool:
    return path == BOOTSTRAP_PREFIX or path.startswith(f"{BOOTSTRAP_PREFIX}/jobs/")


def get_app_settings() -> Settings:
    return get_settings()


def get_session_maker(request: Request) -> async_sessionmaker[AsyncSession]:
    return request.app.state.session_maker


def get_gateway_supervisor(request: Request) -> GatewaySupervisor:
    return request.app.state.gateway_supervisor


def get_team_hub(request: Request) -> TeamHubClient:
    return request.app.state.team_hub


def get_service_center(request: Request):
    return request.app.state.service_center


def get_task_routing_registry(request: Request) -> TaskRoutingRegistry:
    return request.app.state.task_routing_registry


async def get_db_session(
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> AsyncIterator[AsyncSession]:
    session = session_maker()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


def get_profile_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
) -> ProfileService:
    return ProfileService(settings, ProfileRepository(session))


def get_role_library_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> RoleLibraryService:
    return RoleLibraryService(
        settings,
        ProfileRepository(session),
        RoleSpecRepository(session),
        gateway_supervisor=supervisor,
    )


def get_hermes_service(
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_app_settings),
) -> HermesGatewayService:
    return HermesGatewayService(session, settings)


def get_task_runtime(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    gw: Annotated[GatewaySupervisor, Depends(get_gateway_supervisor)],
    rr: Annotated[TaskRoutingRegistry, Depends(get_task_routing_registry)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> TaskRuntimeService:
    return TaskRuntimeService(db, settings, gw, rr)


def get_approval_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
):
    from services.approval_service import ApprovalService

    return ApprovalService(db, settings)


def require_loopback(request: Request) -> None:
    client = request.client.host if request.client else "127.0.0.1"
    allowed = {"127.0.0.1", "::1", "localhost", "testclient", "test"}
    if client not in allowed:
        raise HTTPException(status_code=403, detail="Pairing only allowed from loopback")


# @lat: [[auth-pairing#鉴权依赖]]
async def verify_desktop_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_app_settings)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    token: Annotated[str | None, Header(alias="X-Copilot-Desktop-Token")] = None,
) -> None:
    path = request.url.path
    if path in AUTH_WHITELIST or path.startswith("/api/v1/pairings/"):
        return

    bearer: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    if _is_bootstrap_path(path):
        if not bearer:
            if settings.require_auth():
                raise HTTPException(status_code=401, detail="Bootstrap token required")
            return
        session_maker = request.app.state.session_maker
        session = session_maker()
        try:
            from services.bootstrap_service import BootstrapService

            boot = await BootstrapService(settings, session).authenticate_token(bearer)
            await session.commit()
            if boot is not None:
                request.state.bootstrap_session_id = boot.id
                return
        finally:
            await session.close()
        raise HTTPException(status_code=401, detail="Invalid or expired bootstrap token")

    if not settings.require_auth():
        return

    # Prefer device token (Bearer)
    if bearer:
        session_maker = request.app.state.session_maker
        session = session_maker()
        try:
            from services.pairing_service import PairingService

            device = await PairingService(settings, session).authenticate_token(bearer)
            await session.commit()
            if device is not None:
                request.state.device_id = device.id
                return
        finally:
            await session.close()
        raise HTTPException(status_code=401, detail="Invalid or revoked device token")

    # Legacy header bridge (deprecated)
    if settings.runtime_allow_legacy_token:
        expected = settings.effective_legacy_token()
        if expected and token == expected:
            request.state.device_id = "legacy"
            return
        # Also accept legacy when COPILOT_REQUIRE_TOKEN path used empty expected
        if not expected and not settings.runtime_require_auth:
            return

    raise HTTPException(status_code=401, detail="Invalid or missing authorization")
