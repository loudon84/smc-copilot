from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request) -> dict[str, str]:
    # Lab/test with in-memory repos is always ready; production can extend checks.
    return {"status": "ready", "saltEnv": request.app.state.settings.salt_env}
