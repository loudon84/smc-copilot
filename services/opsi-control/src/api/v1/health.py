from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request):
    settings = request.app.state.settings
    checks: dict[str, str] = {"process": "ok", "opsiEnv": settings.opsi_env}
    if settings.opsi_env != "production":
        checks["mode"] = "lab_or_test"
        return {"status": "ready", **checks}
    ok = True
    rpc = request.app.state.rpc
    if type(rpc).__name__.startswith("Fake"):
        checks["opsiRpc"] = "fail"
        ok = False
    else:
        try:
            rpc_ok = await rpc.ready()
        except Exception:
            rpc_ok = False
        checks["opsiRpc"] = "ok" if rpc_ok else "fail"
        ok = ok and rpc_ok
    body = {"status": "ready" if ok else "not_ready", **checks}
    if not ok:
        return JSONResponse(status_code=503, content=body)
    return body
