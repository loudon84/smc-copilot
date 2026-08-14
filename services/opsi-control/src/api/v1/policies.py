from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from core.auth import AuthPrincipal, Scope, require_scope
from schemas.models import PolicyApplyRequest

router = APIRouter(tags=["policies"])


@router.post("/policies/apply")
async def apply_policy(
    body: PolicyApplyRequest,
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(require_scope(Scope.POLICY_APPLY))],
):
    return await request.app.state.policies.apply(body, principal.subject)
