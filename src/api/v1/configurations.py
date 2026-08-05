from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session, get_gateway_supervisor
from core.config import Settings
from schemas.runtime import (
    ConfigurationPatchRequest,
    McpServerCreateRequest,
    McpServerResponse,
)
from services.configuration_service import ConfigurationService
from services.gateway_supervisor import GatewaySupervisor
from services.mcp_service import McpService

router = APIRouter(tags=["instance-config-mcp"])


@router.get("/instances/{instance_id}/configuration")
async def get_configuration(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await ConfigurationService(settings, session).get(instance_id)


@router.patch("/instances/{instance_id}/configuration")
async def patch_configuration(
    instance_id: str,
    body: ConfigurationPatchRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> dict:
    svc = ConfigurationService(settings, session)
    result = await svc.patch(instance_id, body.values, group=body.group)
    if result.get("restartRequired"):
        try:
            await supervisor.restart_instance(instance_id)
            result["restarted"] = True
        except Exception as exc:
            result["restarted"] = False
            result["restartError"] = str(exc)
    return result


@router.post("/instances/{instance_id}/configuration/validate")
async def validate_configuration(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await ConfigurationService(settings, session).validate(instance_id)


@router.post("/instances/{instance_id}/configuration/reload")
async def reload_configuration(
    instance_id: str,
    supervisor: GatewaySupervisor = Depends(get_gateway_supervisor),
) -> dict:
    await supervisor.restart_instance(instance_id)
    return {"status": "reloaded"}


@router.get("/instances/{instance_id}/mcp/servers", response_model=list[McpServerResponse])
async def list_mcp_servers(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[McpServerResponse]:
    return McpService(settings, session).list(instance_id)


@router.post("/instances/{instance_id}/mcp/servers", response_model=McpServerResponse)
async def create_mcp_server(
    instance_id: str,
    body: McpServerCreateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return McpService(settings, session).create(instance_id, body)


@router.get("/instances/{instance_id}/mcp/servers/{server_id}", response_model=McpServerResponse)
async def get_mcp_server(
    instance_id: str,
    server_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return McpService(settings, session).get(instance_id, server_id)


@router.put("/instances/{instance_id}/mcp/servers/{server_id}", response_model=McpServerResponse)
async def put_mcp_server(
    instance_id: str,
    server_id: str,
    body: McpServerCreateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return McpService(settings, session).update(instance_id, server_id, body)


@router.delete("/instances/{instance_id}/mcp/servers/{server_id}")
async def delete_mcp_server(
    instance_id: str,
    server_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    McpService(settings, session).delete(instance_id, server_id)
    return {"status": "deleted"}


@router.post("/instances/{instance_id}/mcp/servers/{server_id}/test", response_model=McpServerResponse)
async def test_mcp_server(
    instance_id: str,
    server_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return await McpService(settings, session).test(instance_id, server_id)


@router.post("/instances/{instance_id}/mcp/servers/{server_id}/enable", response_model=McpServerResponse)
async def enable_mcp_server(
    instance_id: str,
    server_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return McpService(settings, session).set_enabled(instance_id, server_id, True)


@router.post("/instances/{instance_id}/mcp/servers/{server_id}/disable", response_model=McpServerResponse)
async def disable_mcp_server(
    instance_id: str,
    server_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    return McpService(settings, session).set_enabled(instance_id, server_id, False)
