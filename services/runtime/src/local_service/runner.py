from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import uvicorn

from core.config import get_settings
from local_service.service_state import mark_service_boot

if TYPE_CHECKING:
    from uvicorn import Server

_server: Server | None = None


def get_server() -> Server | None:
    return _server


def request_shutdown() -> None:
    server = _server
    if server is not None:
        server.should_exit = True


async def _serve() -> None:
    global _server
    settings = get_settings()
    mark_service_boot()
    config = uvicorn.Config(
        "main:app",
        host=settings.bind_host,
        port=settings.bind_port,
        reload=False,
        access_log=False,
        app_dir="src",
    )
    _server = uvicorn.Server(config)
    await _server.serve()


def run_local_service() -> None:
    """Run FastAPI control plane (blocking). Used by dev mode and Windows Service."""
    asyncio.run(_serve())
