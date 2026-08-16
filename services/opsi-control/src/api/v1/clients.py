from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.models import BindingUpsertRequest, InventoryEvidenceUpsertRequest

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


@router.put("/clients/{client_id}/binding")
async def put_binding(
    client_id: str,
    body: BindingUpsertRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.INVENTORY_WRITE))],
    _idem: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    return await request.app.state.inventory.put_binding(client_id, body, principal)


@router.post("/clients/{client_id}/inventory-refresh")
async def inventory_refresh(
    client_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_WRITE))],
):
    return await request.app.state.inventory.refresh_inventory(client_id)


@router.put("/clients/{client_id}/inventory-evidence")
async def put_inventory_evidence(
    client_id: str,
    body: InventoryEvidenceUpsertRequest,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_WRITE))],
):
    return await request.app.state.inventory.put_evidence(client_id, body)


@router.get("/clients/{client_id}/inventory-evidence")
async def inventory_evidence(
    client_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))],
):
    return await request.app.state.inventory.inventory_evidence(client_id)
