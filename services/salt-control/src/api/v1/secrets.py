from __future__ import annotations

from fastapi import APIRouter, Request, Response

from core.auth import DeviceAuth
from core.errors import ErrorCode, SaltControlError
from schemas.secret import SecretResolveRequest, SecretResolveResponse

router = APIRouter(tags=["secrets"])


@router.post("/secrets:resolve", response_model=SecretResolveResponse)
async def resolve_secrets(
    body: SecretResolveRequest,
    request: Request,
    response: Response,
    auth: DeviceAuth,
) -> SecretResolveResponse:
    if auth.endpoint_id != body.endpoint_id:
        raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)
    response.headers["Cache-Control"] = "no-store"
    return await request.app.state.secret_service.resolve(body)
