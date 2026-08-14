from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import Scope, require_scope

router = APIRouter(tags=["clients"])


@router.get("/clients")
async def list_clients(request: Request, _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))]):
    return {"items": await request.app.state.inventory.list_clients()}


@router.get("/clients/{client_id}")
async def get_client(
    client_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.inventory.get_client(client_id)


@router.get("/clients/{client_id}/state")
async def client_state(
    client_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.inventory.client_state(client_id)
