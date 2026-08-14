from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import Scope, require_scope

router = APIRouter(tags=["products"])


@router.get("/products")
async def list_products(request: Request, _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))]):
    return {"items": await request.app.state.inventory.list_products()}
