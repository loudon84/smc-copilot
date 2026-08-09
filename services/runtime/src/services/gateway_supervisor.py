from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.constants import GatewayStatus
from core.errors import ConflictError, GatewayError
from core.logging import get_logger
from db.models.profile import Profile
from db.repositories.profile_repo import ProfileRepository
from db.repositories.v12_repos import AuditRepository
from integrations.hermes.client import HermesGatewayClient
from runtime.gateway_process import GatewayProcessManager, is_pid_alive
from runtime.port_allocator import is_port_available
from schemas.profile import ProfileStatusResponse
from schemas.runtime import InstanceResponse
from services.gateway_credential_service import GatewayCredentialService
from services.instance_gateway_service import InstanceGatewayService
from services.profile_service import ProfileService

logger = get_logger(__name__)

_STARTING_STALE_SEC = 60.0
_PORT_FREE_WAIT_SEC = 5.0


# @lat: [[gateway-supervisor#Gateway 监管]]
class GatewaySupervisor:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        process_manager: GatewayProcessManager | None = None,
        runtime_instance_id: str | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._process_manager = process_manager or GatewayProcessManager(settings)
        self._mock_command: list[str] | None = None
        self._instances = InstanceGatewayService(
            settings=settings,
            session_maker=session_maker,
            process_manager=self._process_manager,
            runtime_instance_id=runtime_instance_id,
        )

    def set_mock_gateway_command(self, cmd: list[str]) -> None:
        """Test hook: use mock HTTP gateway script instead of hermes CLI."""
        self._mock_command = cmd
        self._instances.set_mock_gateway_command(cmd)

    # --- Instance lifecycle (v1.3.1 FR-05) ---

    async def start_instance(self, instance_id: str) -> InstanceResponse:
        return await self._instances.start_instance(instance_id)

    async def stop_instance(self, instance_id: str) -> InstanceResponse:
        return await self._instances.stop_instance(instance_id)

    async def restart_instance(self, instance_id: str) -> InstanceResponse:
        return await self._instances.restart_instance(instance_id)

    async def refresh_instance_status(self, instance_id: str) -> InstanceResponse:
        return await self._instances.refresh_instance_status(instance_id)

    async def get_instance_health(self, instance_id: str) -> dict:
        return await self._instances.get_detailed_health(instance_id)

    async def get_instance_state(self, instance_id: str) -> dict:
        return await self._instances.get_state(instance_id)

    async def get_instance_diagnostics(self, instance_id: str) -> dict:
        return await self._instances.get_diagnostics(instance_id)

    async def reconcile_instance(self, instance_id: str) -> dict:
        return await self._instances.reconcile_instance(instance_id)

    async def reconcile_instances_on_boot(self) -> None:
        await self._instances.reconcile_instances_on_boot()

    async def start_auto_start_instances(self) -> list[InstanceResponse]:
        return await self._instances.start_auto_start_instances()

    async def shutdown_all_instances(self, *, preserve: bool = False) -> None:
        await self._instances.shutdown_all_instances(preserve=preserve)

    async def reconcile_legacy_profiles_on_boot(self) -> None:
        await self.reconcile_on_boot()

    async def shutdown_all_legacy_profiles(self) -> None:
        await self.shutdown_all()

    async def _resolve_hermes_executable(self, profile_or_instance_id: str) -> str | None:
        """Prefer RuntimeVersion.executable_path bound to Instance, else active version."""
        try:
            from db.models.runtime import HermesInstance, RuntimeVersion
            from db.repositories.runtime_repo import RuntimeVersionRepository

            async with self._session_maker() as session:
                inst = await session.get(HermesInstance, profile_or_instance_id)
                if inst and inst.runtime_version_id:
                    ver = await session.get(RuntimeVersion, inst.runtime_version_id)
                    if ver and ver.executable_path:
                        return ver.executable_path
                active = await RuntimeVersionRepository(session).get_active()
                if active and active.executable_path:
                    return active.executable_path
        except Exception:
            logger.warning("resolve_hermes_executable_failed", profile_id=profile_or_instance_id)
        return None

    async def _with_session(self) -> tuple[AsyncSession, ProfileService]:
        session = self._session_maker()
        repo = ProfileRepository(session)
        return session, ProfileService(self._settings, repo)

    async def _append_profile_audit(
        self,
        session: AsyncSession,
        profile: Profile,
        action: str,
        *,
        extra: dict | None = None,
    ) -> None:
        payload: dict = {
            "profile_id": profile.id,
            "profile_name": profile.name,
            "gateway_port": profile.gateway_port,
            "status": profile.status,
        }
        if extra:
            payload.update(extra)
        await AuditRepository(session).log(action=action, actor="gateway_supervisor", payload=payload)

    async def refresh_status(self, profile_id: str) -> ProfileStatusResponse:
        session, svc = await self._with_session()
        try:
            profile = await svc.get_profile(profile_id)
            return await self._compute_status(session, svc, profile)
        finally:
            await session.commit()
            await session.close()

    async def _gateway_client(self, session: AsyncSession, profile: Profile) -> HermesGatewayClient:
        key = await GatewayCredentialService(self._settings, session).optional_key_for_profile(profile.name)
        return HermesGatewayClient(profile.gateway_port, api_key=key)

    async def _compute_status(
        self, session: AsyncSession, svc: ProfileService, profile: Profile
    ) -> ProfileStatusResponse:
        handle = self._process_manager.get_handle(profile.id)
        alive = handle.is_alive() if handle else False
        pid = handle.pid if handle and alive else profile.gateway_pid
        client = await self._gateway_client(session, profile)

        healthy = False
        message: str | None = None
        health_checked = False

        if profile.status == GatewayStatus.RUNNING.value and not alive:
            if pid and is_pid_alive(pid):
                healthy = await client.health_check()
                health_checked = True
                if not healthy:
                    profile = await svc.set_status(profile, GatewayStatus.ERROR)
                    message = "Gateway health check failed"
            elif pid and not is_pid_alive(pid):
                profile = await svc.set_status(profile, GatewayStatus.ERROR)
                message = "Gateway process exited unexpectedly"
            else:
                profile = await svc.set_status(profile, GatewayStatus.ERROR)
                message = "Gateway process not tracked locally"
        elif alive and profile.status != GatewayStatus.RUNNING.value:
            profile = await svc.set_status(profile, GatewayStatus.RUNNING, pid=pid)
            message = None

        if profile.status == GatewayStatus.RUNNING.value and not health_checked:
            healthy = await client.health_check()
            if not healthy and not alive:
                profile = await svc.set_status(profile, GatewayStatus.ERROR)
                message = "Gateway health check failed"

        await session.flush()
        return ProfileStatusResponse(
            profile_id=profile.id,
            status=GatewayStatus(profile.status),
            gateway_port=profile.gateway_port,
            gateway_pid=profile.gateway_pid,
            healthy=healthy,
            message=message,
        )

    def _starting_is_stale(self, profile: Profile) -> bool:
        updated = profile.updated_at
        if updated is None:
            return False
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=UTC)
        age = (datetime.now(UTC) - updated).total_seconds()
        return age > _STARTING_STALE_SEC

    @staticmethod
    def _wrap_start_error(exc: Exception) -> Exception:
        if isinstance(exc, (ConflictError, GatewayError)):
            return exc
        if isinstance(exc, FileNotFoundError):
            return GatewayError(f"Hermes gateway command not found: {exc}")
        if isinstance(exc, OSError):
            return GatewayError(f"Failed to start gateway process: {exc}")
        return GatewayError(f"Failed to start profile gateway: {exc}")

    async def _recover_after_start_failure(self, profile_id: str, reason: str) -> None:
        session2, svc2 = await self._with_session()
        try:
            p = await svc2.get_profile(profile_id)
            if p.status in (GatewayStatus.STARTING.value, GatewayStatus.RUNNING.value):
                p = await svc2.set_status(p, GatewayStatus.ERROR)
            await self._append_profile_audit(session2, p, "profile_start_failed", extra={"reason": reason})
            await session2.commit()
        finally:
            await session2.close()

    async def _wait_port_free(self, port: int, *, timeout: float = _PORT_FREE_WAIT_SEC) -> None:
        """Wait for port to free. Never force-kill unknown listeners (PRD v1.5 §96.4)."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if is_port_available("127.0.0.1", port):
                return
            await asyncio.sleep(0.2)
        raise GatewayError(
            f"Gateway port {port} still occupied after stop; refusing force release "
            "(port ownership conflict — resolve manually)"
        )

    async def start_profile(self, profile_id: str) -> ProfileStatusResponse:
        session, svc = await self._with_session()
        try:
            profile = await svc.get_profile(profile_id)
            if not profile.enabled:
                raise ConflictError(f"Profile {profile.name} is disabled")
            if profile.status == GatewayStatus.STARTING.value and self._starting_is_stale(profile):
                profile = await svc.set_status(profile, GatewayStatus.STOPPED)
                await session.commit()
            if profile.status in (GatewayStatus.STARTING.value, GatewayStatus.RUNNING.value):
                handle = self._process_manager.get_handle(profile.id)
                if handle and handle.is_alive():
                    return await self._compute_status(session, svc, profile)

            profile = await svc.set_status(profile, GatewayStatus.STARTING)
            await session.commit()

            try:
                hermes_executable = await self._resolve_hermes_executable(profile.id)
                await self._process_manager.start(
                    profile.id,
                    profile.name,
                    profile.gateway_port,
                    mock_command=self._mock_command,
                    hermes_executable=hermes_executable,
                )
                handle = self._process_manager.get_handle(profile.id)
                profile = await svc.set_status(
                    profile,
                    GatewayStatus.RUNNING,
                    pid=handle.pid if handle else None,
                )

                key = await GatewayCredentialService(self._settings, session).optional_key_for_profile(profile.name)
                healthy = await self._wait_for_health(profile.gateway_port, api_key=key)
                if not healthy:
                    profile = await svc.set_status(profile, GatewayStatus.ERROR)
                    await self._append_profile_audit(
                        session,
                        profile,
                        "profile_start_failed",
                        extra={"reason": "health_check_failed"},
                    )
                    await session.commit()
                    raise GatewayError(f"Gateway on port {profile.gateway_port} failed health check")

                await self._append_profile_audit(session, profile, "profile_started")
                await session.commit()
                return ProfileStatusResponse(
                    profile_id=profile.id,
                    status=GatewayStatus(profile.status),
                    gateway_port=profile.gateway_port,
                    gateway_pid=profile.gateway_pid,
                    healthy=True,
                    message=None,
                )
            except Exception as exc:
                await session.rollback()
                reason = str(exc)
                try:
                    await self._recover_after_start_failure(profile_id, reason)
                except Exception:
                    logger.exception("profile_start_recovery_failed", profile_id=profile_id)
                raise self._wrap_start_error(exc) from exc
        finally:
            await session.close()

    async def _wait_for_health(self, port: int, *, api_key: str | None = None) -> bool:
        client = HermesGatewayClient(port, api_key=api_key)
        deadline = time.monotonic() + self._settings.gateway_health_timeout_sec
        while time.monotonic() < deadline:
            if await client.health_check():
                return True
            await asyncio.sleep(self._settings.gateway_health_poll_interval_sec)
        return False

    async def restart_profile(self, profile_id: str) -> ProfileStatusResponse:
        session, svc = await self._with_session()
        try:
            profile = await svc.get_profile(profile_id)
            port = profile.gateway_port
        finally:
            await session.close()

        await self.stop_profile(profile_id)
        await self._wait_port_free(port)
        return await self.start_profile(profile_id)

    async def stop_profile(self, profile_id: str) -> ProfileStatusResponse:
        session, svc = await self._with_session()
        try:
            profile = await svc.get_profile(profile_id)
            # PRD v1.5: never kill unknown port listeners without ownership fingerprint.
            await self._process_manager.stop(
                profile.id,
                pid=profile.gateway_pid,
                port=profile.gateway_port,
                kill_unknown_port_listeners=False,
            )
            profile = await svc.set_status(profile, GatewayStatus.STOPPED)
            await self._append_profile_audit(session, profile, "profile_stopped")
            await session.commit()
            return ProfileStatusResponse(
                profile_id=profile.id,
                status=GatewayStatus.STOPPED,
                gateway_port=profile.gateway_port,
                gateway_pid=None,
                healthy=False,
                message=None,
            )
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def get_gateway_health(self, gateway_id: str) -> ProfileStatusResponse:
        # V1.0: gateway_id == profile_id
        return await self.refresh_status(gateway_id)

    def read_gateway_logs(
        self, gateway_id: str, *, tail: int = 200, profile_name: str | None = None
    ) -> tuple[list[str], bool]:
        lines, truncated = self._process_manager.read_logs(gateway_id, tail=tail)
        if lines:
            return lines, truncated
        if profile_name:
            log_path = self._settings.log_dir_path / f"gateway-{profile_name}.log"
            if log_path.exists():
                all_lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                truncated = len(all_lines) > tail
                return all_lines[-tail:], truncated
        return [], False

    async def shutdown_all(self) -> None:
        session, svc = await self._with_session()
        try:
            profiles = await svc.list_profiles()
            for profile in profiles:
                if (
                    profile.status
                    not in (
                        GatewayStatus.RUNNING.value,
                        GatewayStatus.STARTING.value,
                    )
                    and profile.gateway_pid is None
                ):
                    continue

                await self._process_manager.stop(profile.id, pid=profile.gateway_pid)
                profile = await svc.set_status(profile, GatewayStatus.STOPPED)
                await self._append_profile_audit(
                    session,
                    profile,
                    "profile_stopped",
                    extra={"reason": "service_shutdown"},
                )
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

        await self._process_manager.shutdown_all()

    async def reconcile_on_boot(self) -> None:
        """Reconcile DB running state with OS processes after service restart."""
        session, svc = await self._with_session()
        try:
            profiles = await svc.list_profiles()
            for profile in profiles:
                if profile.status != GatewayStatus.RUNNING.value:
                    continue

                pid = profile.gateway_pid
                handle = self._process_manager.get_handle(profile.id)
                tracked_alive = handle.is_alive() if handle else False

                if tracked_alive:
                    await self._append_profile_audit(
                        session,
                        profile,
                        "profile_reconciled",
                        extra={"tracked": True, "action": "keep_running"},
                    )
                    continue

                if pid and is_pid_alive(pid):
                    healthy = await (await self._gateway_client(session, profile)).health_check()
                    if healthy:
                        await self._append_profile_audit(
                            session,
                            profile,
                            "profile_reconciled",
                            extra={"tracked": False, "pid": pid, "action": "keep_running"},
                        )
                        continue

                    # PRD v1.5 §96.3 — profiles lack process_create_time fingerprint;
                    # never terminate on unhealthy alone (PID may have been reused).
                    profile = await svc.set_status(profile, GatewayStatus.ERROR)
                    await self._append_profile_audit(
                        session,
                        profile,
                        "profile_reconciled",
                        extra={"pid": pid, "action": "mark_error_unhealthy_no_kill"},
                    )
                    continue

                profile = await svc.set_status(profile, GatewayStatus.ERROR)
                await self._append_profile_audit(
                    session,
                    profile,
                    "profile_reconciled",
                    extra={"action": "mark_error_pid_gone"},
                )

            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def start_auto_start_profiles(self) -> list[ProfileStatusResponse]:
        """Start profiles with enabled=true and auto_start=true that are not running."""
        session, svc = await self._with_session()
        try:
            profiles = await svc.list_profiles()
            targets = [
                p
                for p in profiles
                if p.enabled
                and p.auto_start
                and p.status not in (GatewayStatus.RUNNING.value, GatewayStatus.STARTING.value)
            ]
        finally:
            await session.close()

        results: list[ProfileStatusResponse] = []
        for profile in targets:
            try:
                result = await self.start_profile(profile.id)
                results.append(result)
            except Exception as exc:
                logger.warning(
                    "profile_autostart_failed",
                    profile_id=profile.id,
                    profile_name=profile.name,
                    error=str(exc),
                )
                try:
                    session2, svc2 = await self._with_session()
                    try:
                        p = await svc2.get_profile(profile.id)
                        await self._append_profile_audit(
                            session2,
                            p,
                            "profile_autostart_failed",
                            extra={"reason": str(exc)},
                        )
                        await session2.commit()
                    finally:
                        await session2.close()
                except Exception:
                    pass
        return results

    async def get_profile_for_hermes(self, profile_id: str) -> Profile:
        session, svc = await self._with_session()
        try:
            profile = await svc.get_profile(profile_id)
            status = await self._compute_status(session, svc, profile)
            await session.commit()
            if status.status != GatewayStatus.RUNNING or not status.healthy:
                raise GatewayError(status.message or f"Gateway not ready: {status.status}")
            return profile
        finally:
            await session.close()
