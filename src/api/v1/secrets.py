from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from schemas.runtime import SecretMetaResponse, SecretPutRequest
from services.secret_service import SecretService

router = APIRouter(prefix="/secrets", tags=["secrets"])


@router.get("/{scope}", response_model=list[SecretMetaResponse])
async def list_secrets(
    scope: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[SecretMetaResponse]:
    return await SecretService(settings, session).list_meta(scope)


@router.put("/{scope}/{name}", response_model=SecretMetaResponse)
async def put_secret(
    scope: str,
    name: str,
    body: SecretPutRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> SecretMetaResponse:
    return await SecretService(settings, session).put(scope, name, body.value)


@router.delete("/{scope}/{name}")
async def delete_secret(
    scope: str,
    name: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    await SecretService(settings, session).delete(scope, name)
    return {"status": "deleted"}
