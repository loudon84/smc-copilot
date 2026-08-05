from __future__ import annotations

from fastapi import FastAPI

from version import __version__
from api.middleware.cors_asgi import PureAsgiCorsMiddleware
from api.middleware.error_envelope import register_error_handlers
from api.router import api_router
from core.config import get_settings
from core.lifecycle import lifespan


# @lat: [[architecture#应用装配]]
def create_app() -> FastAPI:
    app = FastAPI(
        title="Hermes Runtime Service",
        version=__version__,
        description="Local Hermes Runtime Service for smc-copilot-desktop",
        lifespan=lifespan,
    )
    register_error_handlers(app)
    app.include_router(api_router)
    return app


def build_asgi_app(fastapi_app: FastAPI | None = None) -> PureAsgiCorsMiddleware:
    """Wrap FastAPI with pure ASGI CORS (safe for SSE; used by uvicorn entry)."""
    inner = fastapi_app if fastapi_app is not None else create_app()
    settings = get_settings()
    origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    if not origins:
        origins = ["http://127.0.0.1", "http://localhost"]
    return PureAsgiCorsMiddleware(inner, allow_origins=origins)
