from __future__ import annotations

from fastapi import APIRouter, Query, Request

from core.auth import MasterAuth
from schemas.desired_state import DesiredStateResponse

router = APIRouter(tags=["desired-state"])


@router.get("/endpoints/{endpoint_id}/desired-state", response_model=DesiredStateResponse)
async def get_desired_state(
    endpoint_id: str,
    request: Request,
    _auth: MasterAuth,
    known_revision: str | None = Query(default=None, alias="knownRevision"),
) -> DesiredStateResponse:
    return await request.app.state.desired_state_service.get(endpoint_id, known_revision)
