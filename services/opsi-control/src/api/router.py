from __future__ import annotations

from fastapi import APIRouter

from api.v1 import actions, clients, diagnostics, health, policies, products, rollouts
from api.v2.router import v2_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(clients.router, prefix="/api/v1/opsi")
api_router.include_router(products.router, prefix="/api/v1/opsi")
api_router.include_router(actions.router, prefix="/api/v1/opsi")
api_router.include_router(policies.router, prefix="/api/v1/opsi")
api_router.include_router(diagnostics.router, prefix="/api/v1/opsi")
api_router.include_router(rollouts.router, prefix="/api/v1/opsi")
api_router.include_router(v2_router, prefix="/api/v2/opsi")
