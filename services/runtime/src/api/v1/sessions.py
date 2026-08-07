from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from integrations.hermes.session_adapter import HermesSessionAdapter
from services.instance_service import InstanceService

router = APIRouter(tags=["sessions"])


@router.get("/instances/{instance_id}/sessions")
async def list_sessions(
    instance_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    inst = await InstanceService(settings, session).get(instance_id)
    return await HermesSessionAdapter(settings, gateway_port=inst.gateway_port).list_sessions()


@router.get("/instances/{instance_id}/sessions/search")
async def search_sessions(
    instance_id: str,
    q: str = "",
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    inst = await InstanceService(settings, session).get(instance_id)
    return await HermesSessionAdapter(settings, gateway_port=inst.gateway_port).search(q)


@router.get("/instances/{instance_id}/sessions/{session_id}")
async def get_session(
    instance_id: str,
    session_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    inst = await InstanceService(settings, session).get(instance_id)
    return await HermesSessionAdapter(settings, gateway_port=inst.gateway_port).get_session(session_id)


@router.delete("/instances/{instance_id}/sessions/{session_id}")
async def delete_session(
    instance_id: str,
    session_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    inst = await InstanceService(settings, session).get(instance_id)
    await HermesSessionAdapter(settings, gateway_port=inst.gateway_port).delete_session(session_id)
    return {"status": "deleted"}
