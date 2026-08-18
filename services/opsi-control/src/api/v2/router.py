from __future__ import annotations

from fastapi import APIRouter

from api.v2 import actions, artifacts, clients, configs, releases

v2_router = APIRouter()
v2_router.include_router(clients.router)
v2_router.include_router(actions.router)
v2_router.include_router(configs.router)
v2_router.include_router(releases.router)
v2_router.include_router(artifacts.router)
