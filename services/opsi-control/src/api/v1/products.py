from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import Scope, require_scope
from core.errors import ErrorCode, OpsiControlError
from schemas.models import ProductReleaseUpsertRequest

router = APIRouter(tags=["products"])


@router.get("/products")
async def list_products(request: Request, _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))]):
    return {"items": await request.app.state.inventory.list_products()}


@router.get("/products/releases")
async def list_releases(request: Request, _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_READ))]):
    store = request.app.state.inventory_store
    getter = getattr(store, "get_product_release", None)
    if getter is None:
        return {"items": []}
    item = await getter("smc-hermes-agent")
    return {"items": [item] if item else []}


@router.put("/products/releases")
async def put_release(
    body: ProductReleaseUpsertRequest,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.INVENTORY_WRITE))],
):
    settings = request.app.state.settings
    if settings.legacy_product_frozen:
        return _legacy_frozen_response("PUT /products/releases")
    store = request.app.state.inventory_store
    putter = getattr(store, "put_product_release", None)
    if putter is None:
        raise OpsiControlError(ErrorCode.OPSI_UNAVAILABLE, "release store missing", status_code=503)
    payload = body.model_dump(by_alias=True)
    await putter(body.product_id, payload)
    return payload


def _legacy_frozen_response(endpoint: str) -> dict:
    from fastapi.responses import JSONResponse
    raise OpsiControlError(
        ErrorCode.PRECONDITION_FAILED,
        f"legacy Product mutation frozen; migrate to /api/v2/opsi — endpoint: {endpoint}",
        status_code=410,
    )
