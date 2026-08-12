from __future__ import annotations

from fastapi import APIRouter, Query

from api.deps import RequestServicesDep
from core.auth import MasterAuth
from schemas.desired_state import DesiredStateResponse

router = APIRouter(tags=["desired-state"])


@router.get("/endpoints/{endpoint_id}/desired-state", response_model=DesiredStateResponse)
async def get_desired_state(
    endpoint_id: str,
    services: RequestServicesDep,
    _auth: MasterAuth,
    known_revision: str | None = Query(default=None, alias="knownRevision"),
) -> DesiredStateResponse:
    return await services.desired_state_service.get(endpoint_id, known_revision)
