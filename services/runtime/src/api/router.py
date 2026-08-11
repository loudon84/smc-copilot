from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import verify_desktop_token
from api.v1 import (
    approvals,
    attachments,
    bootstrap,
    chat,
    chat_commands,
    chat_runs,
    configurations,
    desktop_workbench,
    diagnostics,
    endpoint,
    experience,
    expert_mcp,
    gateways,
    health,
    hermes_runs,
    instance_chat,
    instances,
    kanban,
    memory,
    metrics,
    pairings,
    profiles,
    remote_tasks,
    resources,
    role_library,
    runtime,
    secrets,
    service,
    service_center,
    session_chat,
    sessions,
    sync,
    system,
    task_routing,
    tasks,
    team_tasks,
    work_tasks,
    workers,
    workspaces,
)

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_desktop_token)])
api_router.include_router(health.router)
api_router.include_router(system.router)
api_router.include_router(service.router)
api_router.include_router(runtime.router)
api_router.include_router(instance_chat.router)
api_router.include_router(chat_runs.router)
api_router.include_router(chat_commands.router)
api_router.include_router(instances.router)
api_router.include_router(sessions.router)
api_router.include_router(session_chat.router)
api_router.include_router(memory.router)
api_router.include_router(expert_mcp.router)
api_router.include_router(expert_mcp.instance_router)
api_router.include_router(configurations.router)
api_router.include_router(secrets.router)
api_router.include_router(pairings.router)
api_router.include_router(bootstrap.router)
api_router.include_router(diagnostics.router)
api_router.include_router(chat.router)
api_router.include_router(attachments.router)
api_router.include_router(profiles.router)
api_router.include_router(role_library.router)
api_router.include_router(gateways.router)
api_router.include_router(hermes_runs.router)
api_router.include_router(tasks.router)
api_router.include_router(team_tasks.router)
api_router.include_router(endpoint.router)
api_router.include_router(sync.router)
api_router.include_router(resources.router)
api_router.include_router(remote_tasks.router)
api_router.include_router(work_tasks.router)
api_router.include_router(experience.router)
api_router.include_router(workspaces.router)
api_router.include_router(approvals.router)
api_router.include_router(task_routing.router)
api_router.include_router(desktop_workbench.router)
api_router.include_router(metrics.router)
api_router.include_router(workers.router)
api_router.include_router(service_center.router)
api_router.include_router(kanban.router)
