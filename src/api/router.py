from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import verify_desktop_token
from api.v1 import (
    approvals,
    attachments,
    chat,
    configurations,
    desktop_workbench,
    diagnostics,
    gateways,
    health,
    hermes_runs,
    instances,
    pairings,
    profiles,
    role_library,
    runtime,
    secrets,
    service,
    sessions,
    system,
    task_routing,
    tasks,
    team_tasks,
    workspaces,
)

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_desktop_token)])
api_router.include_router(health.router)
api_router.include_router(system.router)
api_router.include_router(service.router)
api_router.include_router(runtime.router)
api_router.include_router(instances.router)
api_router.include_router(sessions.router)
api_router.include_router(configurations.router)
api_router.include_router(secrets.router)
api_router.include_router(pairings.router)
api_router.include_router(diagnostics.router)
api_router.include_router(chat.router)
api_router.include_router(attachments.router)
api_router.include_router(profiles.router)
api_router.include_router(role_library.router)
api_router.include_router(gateways.router)
api_router.include_router(hermes_runs.router)
api_router.include_router(tasks.router)
api_router.include_router(team_tasks.router)
api_router.include_router(workspaces.router)
api_router.include_router(approvals.router)
api_router.include_router(task_routing.router)
api_router.include_router(desktop_workbench.router)
