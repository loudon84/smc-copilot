from __future__ import annotations

from fastapi import FastAPI

from app.modules.documents.router import router as documents_router


def create_app() -> FastAPI:
    app = FastAPI(title="AI OS API", version="0.1.0", description="Frontend data layer: documents, auth, permissions")
    # 同时支持 /api/documents 与 /api/v1/documents，便于 Portal 统一走 NEXT_PUBLIC_API_URL（通常以 /api/v1 为前缀）
    app.include_router(documents_router, prefix="/api")
    app.include_router(documents_router, prefix="/api/v1")
    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
