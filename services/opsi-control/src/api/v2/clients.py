from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import Scope, require_scope
from schemas.v2.models import V2ClientStatusView

router = APIRouter(tags=["v2-clients"])


@router.get("/clients/{client_id}/status", response_model=V2ClientStatusView)
async def client_status(
    client_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.v2_clients.status(client_id)
