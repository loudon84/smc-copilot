from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _alembic_head_ok(engine) -> bool:
    if engine is None:
        return True
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text

        cfg = Config("alembic.ini")
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()
        async with engine.connect() as conn:
            row = await conn.execute(text("select version_num from alembic_version"))
            current = row.scalar()
        return current == head
    except Exception:
        return False


@router.get("/ready")
async def ready(request: Request):
    settings = request.app.state.settings
    checks: dict[str, str] = {"process": "ok", "opsiEnv": settings.opsi_env}
    ok = True

    rpc = request.app.state.rpc
    if type(rpc).__name__.startswith("Fake"):
        if settings.opsi_env == "production":
            checks["opsiRpc"] = "fail"
            ok = False
        else:
            checks["opsiRpc"] = "fake_ok" if await rpc.ready() else "fail"
            ok = ok and await rpc.ready()
    else:
        try:
            rpc_ok = await rpc.ready()
        except Exception:
            rpc_ok = False
        checks["opsiRpc"] = "ok" if rpc_ok else "fail"
        ok = ok and rpc_ok

    engine = getattr(request.app.state, "engine", None)
    if settings.opsi_env == "production":
        if engine is None:
            checks["database"] = "fail"
            ok = False
        else:
            try:
                from sqlalchemy import text

                async with engine.connect() as conn:
                    await conn.execute(text("select 1"))
                checks["database"] = "ok"
            except Exception:
                checks["database"] = "fail"
                ok = False
        alembic_ok = await _alembic_head_ok(engine)
        checks["alembic"] = "ok" if alembic_ok else "fail"
        ok = ok and alembic_ok
        secrets = getattr(request.app.state, "secrets", None)
        if secrets is None:
            checks["secretProvider"] = "fail"
            ok = False
        else:
            secret_ok = await secrets.ready()
            checks["secretProvider"] = "ok" if secret_ok else "fail"
            ok = ok and secret_ok
        heartbeats = await request.app.state.repos.heartbeats.list_fresh(90)
        roles = {item.role for item in heartbeats}
        workers_ok = "dispatcher" in roles and "reconciler" in roles
        checks["workers"] = "ok" if workers_ok else "fail"
        ok = ok and workers_ok
        if type(request.app.state.repos.actions).__name__.startswith("Memory"):
            checks["persistence"] = "fail"
            ok = False
        else:
            checks["persistence"] = "ok"
    else:
        checks["mode"] = "lab_or_test"

    body = {"status": "ready" if ok else "not_ready", **checks}
    if not ok:
        return JSONResponse(status_code=503, content=body)
    return body
