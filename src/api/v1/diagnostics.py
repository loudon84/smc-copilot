from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from runtime.environment_probe import EnvironmentProbe
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import BackupCreateRequest
from services.backup_service import BackupService
from services.runtime_job_service import RuntimeJobService
from fastapi import Request

router = APIRouter(tags=["diagnostics-backup"])


def get_runtime_job_service(request: Request) -> RuntimeJobService:
    return request.app.state.runtime_job_service


@router.get("/diagnostics/summary")
async def diagnostics_summary(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    from services.runtime_status_service import RuntimeStatusService

    status = await RuntimeStatusService(settings, session).status()
    probe = EnvironmentProbe(settings).probe()
    return {
        "runtime": status.model_dump(by_alias=True),
        "environment": {
            "platform": probe.platform,
            "architecture": probe.architecture,
            "diskFreeBytes": probe.disk_free_bytes,
            "python": str(probe.toolchain.python_path) if probe.toolchain.python_path else None,
            "node": str(probe.toolchain.node_path) if probe.toolchain.node_path else None,
            "git": str(probe.toolchain.git_path) if probe.toolchain.git_path else None,
        },
    }


@router.get("/diagnostics/environment")
async def diagnostics_environment(settings: Settings = Depends(get_app_settings)) -> dict:
    probe = EnvironmentProbe(settings).probe()
    layout = RuntimeLayout.from_root(settings.resolved_runtime_data_dir())
    return {
        "platform": probe.platform,
        "architecture": probe.architecture,
        "diskFreeBytes": probe.disk_free_bytes,
        "toolchain": {
            "python": str(probe.toolchain.python_path) if probe.toolchain.python_path else None,
            "node": str(probe.toolchain.node_path) if probe.toolchain.node_path else None,
            "git": str(probe.toolchain.git_path) if probe.toolchain.git_path else None,
            "venvDir": str(probe.toolchain.venv_dir) if probe.toolchain.venv_dir else None,
            "hermesInstallDir": str(probe.toolchain.hermes_install_dir)
            if probe.toolchain.hermes_install_dir
            else None,
        },
        "runtimeDataDir": str(layout.root),
        "hermesHome": str(settings.hermes_home_path),
        "errors": probe.errors,
    }


@router.get("/diagnostics/logs")
async def diagnostics_logs(settings: Settings = Depends(get_app_settings), tail: int = 200) -> dict:
    log_path = settings.log_dir_path / "runtime-service.log"
    if not log_path.exists():
        # fall back to any .log
        candidates = sorted(settings.log_dir_path.glob("*.log"))
        log_path = candidates[0] if candidates else log_path
    if not log_path.exists():
        return {"lines": [], "truncated": False}
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    truncated = len(lines) > tail
    return {"lines": lines[-tail:], "truncated": truncated}


@router.post("/runtime/backups")
async def create_backup(
    body: BackupCreateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return BackupService(settings, session).create(
        include_sessions=body.include_sessions,
        include_skills=body.include_skills,
        include_memories=body.include_memories,
    )


@router.get("/runtime/backups")
async def list_backups(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    return BackupService(settings, session).list_backups()


@router.post("/runtime/backups/{backup_id}/restore")
async def restore_backup(
    backup_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return BackupService(settings, session).restore(backup_id)


@router.delete("/runtime/backups/{backup_id}")
async def delete_backup(
    backup_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    BackupService(settings, session).delete(backup_id)
    return {"status": "deleted"}
