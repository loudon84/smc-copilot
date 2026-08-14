from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import Scope, require_scope

router = APIRouter(tags=["diagnostics"])


@router.get("/diagnostics/{request_id}")
async def get_diagnostic(
    request_id: str,
    request: Request,
    _auth: Annotated[object, Depends(require_scope(Scope.DIAGNOSTICS_READ))],
):
    return await request.app.state.diagnostics.get(request_id)
