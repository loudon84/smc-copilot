from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session, require_loopback
from core.config import Settings
from schemas.runtime import (
    DeviceResponse,
    PairingConfirmRequest,
    PairingConfirmResponse,
    PairingStartResponse,
)
from services.pairing_service import PairingService

router = APIRouter(tags=["pairing"])


@router.post("/pairings/start", response_model=PairingStartResponse)
async def pairing_start(
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
    _loopback: None = Depends(require_loopback),
) -> PairingStartResponse:
    return await PairingService(settings, session).start()


@router.post("/pairings/{pairing_id}/confirm", response_model=PairingConfirmResponse)
async def pairing_confirm(
    pairing_id: str,
    body: PairingConfirmRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
    _loopback: None = Depends(require_loopback),
) -> PairingConfirmResponse:
    return await PairingService(settings, session).confirm(pairing_id, body)


@router.get("/devices", response_model=list[DeviceResponse])
async def list_devices(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[DeviceResponse]:
    return await PairingService(settings, session).list_devices()


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    await PairingService(settings, session).revoke(device_id)
    return {"status": "revoked"}
