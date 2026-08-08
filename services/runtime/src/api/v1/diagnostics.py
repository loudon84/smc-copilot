from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_app_settings, get_db_session
from core.config import Settings
from db.models.chat_runtime import ChatEvent, ChatRun, ChatTurn
from db.models.work_tasks import TaskExecutionQueue, WorkTask
from runtime.environment_probe import EnvironmentProbe
from runtime.platform_paths import RuntimeLayout
from schemas.runtime import BackupCreateRequest
from services.backup_service import BackupService
from services.runtime_job_service import RuntimeJobService
from services.runtime_status_service import RuntimeStatusService

router = APIRouter(tags=["diagnostics-backup"])


def get_runtime_job_service(request: Request) -> RuntimeJobService:
    return request.app.state.runtime_job_service


@router.get("/diagnostics/summary")
async def diagnostics_summary(
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    status = await RuntimeStatusService(settings, session).status()
    probe = EnvironmentProbe(settings).probe()

    active_runs = (
        await session.execute(
            select(func.count()).select_from(ChatRun).where(ChatRun.status.in_(("active", "running", "waiting_interaction")))
        )
    ).scalar_one()
    active_turns = (
        await session.execute(
            select(func.count())
            .select_from(ChatTurn)
            .where(ChatTurn.status.in_(("running", "waiting_clarify", "waiting_approval", "waiting_interaction")))
        )
    ).scalar_one()
    queued_turns = (
        await session.execute(select(func.count()).select_from(ChatTurn).where(ChatTurn.status.in_(("queued", "pending"))))
    ).scalar_one()
    since = datetime.now(UTC) - timedelta(hours=24)
    failed_24h = (
        await session.execute(
            select(func.count())
            .select_from(ChatTurn)
            .where(ChatTurn.status == "failed", ChatTurn.completed_at.is_not(None), ChatTurn.completed_at >= since)
        )
    ).scalar_one()
    event_count = (await session.execute(select(func.count()).select_from(ChatEvent))).scalar_one()

    queue_depth = (
        await session.execute(
            select(TaskExecutionQueue.status, func.count())
            .select_from(TaskExecutionQueue)
            .group_by(TaskExecutionQueue.status)
        )
    ).all()
    task_queue_depth = {str(status): int(count) for status, count in queue_depth}
    active_running_tasks = (
        await session.execute(
            select(func.count()).select_from(WorkTask).where(WorkTask.status.in_(("running", "validating", "starting")))
        )
    ).scalar_one()
    waiting_approval = (
        await session.execute(select(func.count()).select_from(WorkTask).where(WorkTask.status == "waiting_approval"))
    ).scalar_one()
    waiting_input = (
        await session.execute(select(func.count()).select_from(WorkTask).where(WorkTask.status == "waiting_input"))
    ).scalar_one()
    failed_tasks_24h = (
        await session.execute(
            select(func.count())
            .select_from(WorkTask)
            .where(WorkTask.status == "failed", WorkTask.updated_at.is_not(None), WorkTask.updated_at >= since)
        )
    ).scalar_one()

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
        "activeChatRuns": int(active_runs or 0),
        "activeChatTurns": int(active_turns or 0),
        "queuedChatTurns": int(queued_turns or 0),
        "failedChatTurns24h": int(failed_24h or 0),
        "averageTurnDuration": None,
        "chatEventStoreStatus": {"ok": True, "eventCount": int(event_count or 0)},
        "gatewayChatStatus": "unknown",
        "taskRuntime": {
            "activeRunningTasks": int(active_running_tasks or 0),
            "waitingApproval": int(waiting_approval or 0),
            "waitingInput": int(waiting_input or 0),
            "failedTasks24h": int(failed_tasks_24h or 0),
        },
        "scheduler": {
            "taskQueueDepth": task_queue_depth,
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
            "hermesInstallDir": str(probe.toolchain.hermes_install_dir) if probe.toolchain.hermes_install_dir else None,
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
        return {"lines": [], "truncated": False, "source": str(log_path)}
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    truncated = len(lines) > tail
    return {"lines": lines[-tail:], "truncated": truncated, "source": str(log_path)}


@router.post("/diagnostics/bundle")
async def create_diagnostic_bundle(
    request: Request,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    from services.diagnostic_bundle_service import DiagnosticBundleService

    return await DiagnosticBundleService(settings, session, app_state=request.app.state).create_bundle()


@router.post("/runtime/backups")
async def create_backup(
    body: BackupCreateRequest,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await BackupService(settings, session).create_async(
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
    return await BackupService(settings, session).restore(backup_id)


@router.delete("/runtime/backups/{backup_id}")
async def delete_backup(
    backup_id: str,
    settings: Settings = Depends(get_app_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    BackupService(settings, session).delete(backup_id)
    return {"status": "deleted"}
