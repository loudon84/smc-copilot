from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Process liveness only — no dependency checks."""
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request):
    settings = request.app.state.settings
    checks: dict[str, str] = {"process": "ok", "saltEnv": settings.salt_env}

    if settings.salt_env != "production":
        checks["mode"] = "lab_or_test"
        return {"status": "ready", **checks}

    ok = True
    # DB
    try:
        session = request.app.state._boot_session
        if session is None:
            raise RuntimeError("no db session")
        await session.connection()
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "fail"
        ok = False

    backend = request.app.state.backend
    ready_fn = getattr(backend, "ready", None)
    if ready_fn is not None:
        backend_ok = await ready_fn()
    else:
        backend_ok = bool(getattr(backend, "available", True))
    checks["backend"] = "ok" if backend_ok else "fail"
    ok = ok and backend_ok

    masters = request.app.state.masters
    master_ok = True
    for master in masters:
        fn = getattr(master, "ready", None)
        if fn is not None:
            master_ok = master_ok and bool(await fn())
        elif isinstance(master, object) and type(master).__name__.startswith("Fake"):
            master_ok = False
    checks["saltApi"] = "ok" if master_ok and masters else "fail"
    ok = ok and master_ok and bool(masters)

    artifact = request.app.state.artifact_store
    art_fn = getattr(artifact, "ready", None)
    art_ok = await art_fn() if art_fn else True
    checks["artifact"] = "ok" if art_ok else "fail"
    ok = ok and art_ok

    secret = request.app.state.secret_provider
    sec_fn = getattr(secret, "ready", None)
    sec_ok = await sec_fn() if sec_fn else True
    checks["secret"] = "ok" if sec_ok else "fail"
    ok = ok and sec_ok

    body = {"status": "ready" if ok else "not_ready", **checks}
    if not ok:
        return JSONResponse(status_code=503, content=body)
    return body
