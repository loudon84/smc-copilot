from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from services.expert_mcp_gateway_service import ExpertMcpGatewayService

router = APIRouter(prefix="/expert-mcp", tags=["expert-mcp"])


class ExpertMcpConfigPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    endpoint: str | None = None
    enabled: bool | None = None
    access_token: str | None = Field(default=None, alias="accessToken")


@router.get("/status")
async def expert_mcp_status(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).status()


@router.get("/config")
async def expert_mcp_get_config(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).get_config()


@router.patch("/config")
async def expert_mcp_patch_config(
    body: ExpertMcpConfigPatch,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).patch_config(
        body.model_dump(by_alias=True, exclude_none=True)
    )


@router.post("/connect")
async def expert_mcp_connect(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).connect()


@router.post("/reconnect")
async def expert_mcp_reconnect(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).reconnect()


@router.post("/test")
async def expert_mcp_test(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).test()


@router.get("/tools")
async def expert_mcp_tools(
    refresh: bool = False,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, Any]]:
    return await ExpertMcpGatewayService(settings, session).list_tools(refresh=refresh)


@router.get("/diagnostics")
async def expert_mcp_diagnostics(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).diagnostics()


@router.get("/logs")
async def expert_mcp_logs(
    tail: int = 200,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    lines = await ExpertMcpGatewayService(settings, session).logs(tail=tail)
    return {"lines": lines}


instance_router = APIRouter(tags=["expert-mcp"])


@instance_router.post("/instances/{instance_id}/expert-mcp/enable")
async def enable_expert_mcp(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).enable_for_instance(instance_id)


@instance_router.post("/instances/{instance_id}/expert-mcp/disable")
async def disable_expert_mcp(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    return await ExpertMcpGatewayService(settings, session).disable_for_instance(instance_id)
