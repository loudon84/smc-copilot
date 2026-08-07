from __future__ import annotations

from app import build_asgi_app
from core.config import get_settings

app = build_asgi_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.bind_host,
        port=settings.bind_port,
        reload=False,
        app_dir="src",
    )


if __name__ == "__main__":
    main()
