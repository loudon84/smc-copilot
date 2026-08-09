"""Instance-native Gateway lifecycle (v1.3.1 FR-05 + v1.5 Hermes Supervisor)."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import (
    DesiredState,
    GatewayApiState,
    GatewayProcessState,
    InstanceStatus,
    OwnershipState,
    PortOwnership,
)
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeVersion, SecretReference
from integrations.hermes.client import GatewayHealthResult, HermesGatewayClient
from runtime.gateway_process import (
    GatewayProcessManager,
    check_port_ownership,
    is_pid_alive,
    terminate_pid,
)
from runtime.gateway_command_hash import GATEWAY_FINGERPRINT_VERSION, compute_gateway_command_hash
from runtime.hermes_profile_paths import ensure_profile_home
from runtime.hermes_supervisor_metrics import SUPERVISOR_METRICS
from runtime.instance_operation_lock import INSTANCE_OPERATION_LOCK
from runtime.port_allocator import is_port_available
from runtime.runtime_identity import ensure_runtime_instance_id, get_runtime_instance_id
from schemas.runtime import InstanceResponse
from services.gateway_ownership_service import (
    GatewayOwnershipResult,
    GatewayOwnershipService,
)
from services.instance_service import instance_to_response
from services.secret_service import SecretStore

logger = get_logger(__name__)

# In-memory restart timestamps for crash-loop budget (instance_id -> list[monotonic])
_restart_timestamps: dict[str, list[float]] = {}


class InstanceGatewayService:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        process_manager: GatewayProcessManager,
        mock_command: list[str] | None = None,
        runtime_instance_id: str | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._process_manager = process_manager
        self._mock_command = mock_command
        self._secret_store = SecretStore(settings)
        self._runtime_instance_id = runtime_instance_id or ensure_runtime_instance_id()
        self._ownership = GatewayOwnershipService(settings)

    def set_mock_gateway_command(self, cmd: list[str] | None) -> None:
        self._mock_command = cmd

    def _persist_fingerprint(self, inst: HermesInstance, *, handle=None, executable: str | None = None) -> None:
        """Write full Gateway fingerprint v2 to DB (PRD v1.5.2 §20)."""
        if handle is not None:
            # Compatibility columns map to listener identity (PRD §10).
            listener_pid = handle.listener_pid if handle.listener_pid is not None else handle.pid
            listener_ct = (
                handle.listener_create_time
                if handle.listener_create_time is not None
                else handle.process_create_time
            )
            inst.pid = listener_pid
            inst.process_create_time = listener_ct
            inst.gateway_launcher_pid = handle.launcher_pid
            inst.gateway_launcher_create_time = handle.launcher_create_time
            inst.gateway_listener_pid = listener_pid
            inst.gateway_listener_create_time = listener_ct
            inst.gateway_listener_executable_path = (
                handle.listener_executable_path or handle.executable_path
            )
            if handle.launcher_executable_path or handle.executable_path:
                inst.gateway_executable_path = (
                    handle.launcher_executable_path or handle.executable_path
                )
            if handle.command_hash:
                inst.gateway_command_hash = handle.command_hash
        elif executable:
            inst.gateway_executable_path = executable
            inst.gateway_command_hash = compute_gateway_command_hash(
                executable=executable,
                profile_name=inst.profile_name,
                port=inst.gateway_port,
            )
        inst.gateway_started_at = self._now()
        inst.gateway_started_by_runtime = True
        inst.gateway_owner_runtime_id = self._runtime_instance_id or get_runtime_instance_id()
        inst.gateway_fingerprint_version = GATEWAY_FINGERPRINT_VERSION
        inst.ownership_state = OwnershipState.OWNED.value

    def _clear_fingerprint(self, inst: HermesInstance) -> None:
        """Clear fingerprint only on confirmed stop/stale/delete (PRD §36)."""
        inst.pid = None
        inst.process_create_time = None
        inst.gateway_executable_path = None
        inst.gateway_command_hash = None
        inst.gateway_started_at = None
        inst.gateway_started_by_runtime = False
        inst.gateway_owner_runtime_id = None
        inst.gateway_launcher_pid = None
        inst.gateway_launcher_create_time = None
        inst.gateway_listener_pid = None
        inst.gateway_listener_create_time = None
        inst.gateway_listener_executable_path = None
        inst.ownership_state = OwnershipState.UNKNOWN.value

    def _apply_gateway_observation(
        self,
        inst: HermesInstance,
        result: GatewayOwnershipResult,
        *,
        persist_listener_upgrade: bool = True,
    ) -> None:
        """Unified observed-state writer for refresh/worker/reconcile (PRD §66–68)."""
        inst.ownership_state = result.state.value
        process_state = result.process_state
        # Invariant: never persist exited + healthy.
        if (
            process_state == GatewayProcessState.EXITED
            and result.health
            and result.health.healthy
            and result.state not in (OwnershipState.STALE,)
        ):
            process_state = GatewayProcessState.ALIVE
        inst.process_state = process_state.value

        if result.listener_pid is not None:
            inst.pid = result.listener_pid
            inst.gateway_listener_pid = result.listener_pid
        if result.launcher_pid is not None:
            inst.gateway_launcher_pid = result.launcher_pid

        if persist_listener_upgrade and result.upgrade_to_v2 and result.listener_pid is not None:
            try:
                import psutil

                inst.gateway_listener_create_time = float(
                    psutil.Process(result.listener_pid).create_time()
                )
                inst.process_create_time = inst.gateway_listener_create_time
                exe = None
                try:
                    exe = psutil.Process(result.listener_pid).exe()
                except Exception:
                    exe = None
                if exe:
                    inst.gateway_listener_executable_path = exe
                inst.gateway_fingerprint_version = GATEWAY_FINGERPRINT_VERSION
            except Exception:
                pass

        if result.owned_or_adopted and (
            result.health_authenticated or (result.health and result.health.healthy)
        ):
            inst.api_state = GatewayApiState.HEALTHY.value
            inst.healthy = True
            inst.status = InstanceStatus.RUNNING.value
            inst.last_error = None
            inst.last_error_code = None
            inst.last_healthy_at = self._now()
        elif result.state == OwnershipState.STALE:
            inst.api_state = GatewayApiState.UNREACHABLE.value
            inst.healthy = False
            if inst.status == InstanceStatus.RUNNING.value:
                inst.status = InstanceStatus.ERROR.value
                inst.last_error = result.reason or "Gateway process exited unexpectedly"
                inst.last_error_code = "GATEWAY_PROCESS_STALE"
        elif result.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT):
            inst.healthy = False
            inst.status = InstanceStatus.ERROR.value
            inst.last_error_code = "GATEWAY_PORT_OWNERSHIP_CONFLICT"
            inst.last_error = result.reason
            if result.health and result.health.healthy:
                inst.api_state = GatewayApiState.HEALTHY.value
            elif result.health and result.health.error_code == "GATEWAY_AUTH_FAILED":
                inst.api_state = GatewayApiState.UNAUTHORIZED.value
            elif result.health and not result.health.reachable:
                inst.api_state = GatewayApiState.UNREACHABLE.value
        elif result.health is not None:
            self._apply_health_result(inst, result.health)

        inst.last_health_check_at = self._now()

    def _require_owned_or_adopted(self, ownership_state: str | None) -> None:
        if ownership_state in (OwnershipState.OWNED.value, OwnershipState.ADOPTED.value):
            return
        raise RuntimeServiceError(
            "Gateway is not owned by this Runtime; refuse stop/restart",
            code="GATEWAY_NOT_OWNED",
            details={"ownership": ownership_state},
        )

    async def _load_instance(self, session: AsyncSession, instance_id: str) -> HermesInstance:
        inst = await session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return inst

    async def _version_label(self, session: AsyncSession, runtime_version_id: str | None) -> str | None:
        if not runtime_version_id:
            return None
        ver = await session.get(RuntimeVersion, runtime_version_id)
        return ver.version if ver else None

    async def _resolve_executable(self, session: AsyncSession, inst: HermesInstance) -> Path:
        ver: RuntimeVersion | None = None
        if inst.runtime_version_id:
            ver = await session.get(RuntimeVersion, inst.runtime_version_id)
        if ver is None:
            result = await session.execute(select(RuntimeVersion).where(RuntimeVersion.status == "active").limit(1))
            ver = result.scalar_one_or_none()
        if ver is None or not ver.executable_path:
            raise RuntimeServiceError(
                "No RuntimeVersion executable bound to instance",
                code="hermes_executable_missing",
            )
        path = Path(ver.executable_path)
        if not path.exists():
            raise RuntimeServiceError(
                f"Hermes executable missing: {path}",
                code="hermes_executable_missing",
            )
        return path

    async def _resolve_secrets(self, session: AsyncSession, profile_name: str) -> dict[str, str]:
        from runtime.hermes_profile_paths import is_default_profile

        name = (profile_name or "default").strip() or "default"
        scope_ids = {name, f"profile:{name}"}
        if is_default_profile(name):
            scope_ids.add("default")
        result = await session.execute(select(SecretReference).where(SecretReference.scope_id.in_(scope_ids)))
        out: dict[str, str] = {}
        for row in result.scalars().all():
            value = self._secret_store.get(row.storage_key)
            if value:
                out[row.secret_name] = value
        return out

    def _api_server_enabled(self, secrets: dict[str, str]) -> bool:
        return bool((secrets.get("API_SERVER_KEY") or "").strip())

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _apply_health_result(self, inst: HermesInstance, result: GatewayHealthResult) -> None:
        inst.last_health_check_at = self._now()
        if result.latency_ms is not None:
            SUPERVISOR_METRICS.observe_latency(
                inst.id, result.latency_ms, profile=inst.profile_name, port=inst.gateway_port
            )
        if result.healthy:
            inst.api_state = GatewayApiState.HEALTHY.value
            inst.consecutive_health_successes = int(inst.consecutive_health_successes or 0) + 1
            inst.consecutive_health_failures = 0
            recovery = int(self._settings.gateway_health_recovery_threshold)
            if inst.consecutive_health_successes >= recovery:
                inst.healthy = True
                inst.last_healthy_at = self._now()
                if inst.status in (InstanceStatus.ERROR.value, InstanceStatus.DEGRADED.value):
                    inst.status = InstanceStatus.RUNNING.value
                    inst.last_transition_at = self._now()
                inst.last_error = None
                inst.last_error_code = None
            SUPERVISOR_METRICS.set_up(inst.id, True, profile=inst.profile_name, port=inst.gateway_port)
            return

        # Not healthy
        hard_fail_codes = {
            "GATEWAY_AUTH_FAILED",
            "GATEWAY_PORT_OWNERSHIP_CONFLICT",
            "GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
        }
        if result.error_code == "GATEWAY_AUTH_FAILED":
            inst.api_state = GatewayApiState.UNAUTHORIZED.value
            SUPERVISOR_METRICS.inc_auth_failure(inst.id, profile=inst.profile_name, port=inst.gateway_port)
        elif result.error_code == "GATEWAY_UNREACHABLE":
            inst.api_state = GatewayApiState.UNREACHABLE.value
        else:
            inst.api_state = GatewayApiState.DEGRADED.value

        inst.consecutive_health_failures = int(inst.consecutive_health_failures or 0) + 1
        inst.consecutive_health_successes = 0
        inst.last_error_code = result.error_code
        inst.last_error = result.error_code or "Gateway health check failed"

        # Auth / ownership / port conflict: clear healthy on first probe (PRD §96.1).
        if result.error_code in hard_fail_codes:
            inst.healthy = False
            if inst.status == InstanceStatus.RUNNING.value:
                inst.status = InstanceStatus.ERROR.value
                inst.last_transition_at = self._now()
            SUPERVISOR_METRICS.set_up(inst.id, False, profile=inst.profile_name, port=inst.gateway_port)
            return

        threshold = int(self._settings.gateway_health_failure_threshold)
        if inst.consecutive_health_failures >= threshold:
            inst.healthy = False
            if inst.status == InstanceStatus.RUNNING.value:
                inst.status = InstanceStatus.ERROR.value
                inst.last_transition_at = self._now()
            SUPERVISOR_METRICS.set_up(inst.id, False, profile=inst.profile_name, port=inst.gateway_port)
        # Single transient failure → keep api_state as set above (do not overwrite unauthorized)

    async def _check_port_for_start(self, inst: HermesInstance) -> None:
        port_result = check_port_ownership(inst.gateway_port, expected_pid=inst.pid)
        if port_result.state == PortOwnership.FREE:
            return
        if port_result.state == PortOwnership.OWNED:
            return
        SUPERVISOR_METRICS.inc_port_conflict(inst.id, profile=inst.profile_name, port=inst.gateway_port)
        logger.warning(
            "gateway.port.conflict",
            instance_id=inst.id,
            port=inst.gateway_port,
            pids=port_result.pids,
        )
        raise RuntimeServiceError(
            f"Gateway port {inst.gateway_port} is occupied by another process",
            code="gateway_port_conflict",
            details={"port": inst.gateway_port, "pids": port_result.pids, "instancePid": inst.pid},
        )

    def _client_for(self, port: int, secrets: dict[str, str] | None = None) -> HermesGatewayClient:
        key = (secrets or {}).get("API_SERVER_KEY") if secrets else None
        return HermesGatewayClient(port, api_key=key)

    async def _wait_for_health(self, port: int, *, api_key: str | None = None) -> GatewayHealthResult:
        """Startup health wait — strict, no consecutive-failure threshold."""
        client = HermesGatewayClient(port, api_key=api_key)
        timeout = float(self._settings.hermes_gateway_start_timeout_seconds)
        deadline = time.monotonic() + timeout
        last = GatewayHealthResult(
            reachable=False,
            authenticated=False,
            healthy=False,
            error_code="GATEWAY_UNREACHABLE",
        )
        while time.monotonic() < deadline:
            last = await client.health_check()
            if last.healthy:
                return last
            await asyncio.sleep(self._settings.gateway_health_poll_interval_sec)
        return last

    async def refresh_instance_status(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            handle = self._process_manager.get_handle(instance_id)
            tracked_alive = bool(handle and handle.is_alive())
            secrets = await self._resolve_secrets(session, inst.profile_name)

            exe_path: str | None = None
            try:
                exe_path = str(await self._resolve_executable(session, inst))
            except RuntimeServiceError:
                exe_path = None

            inspect = await self._ownership.inspect(
                inst,
                expected_executable=exe_path,
                api_key=secrets.get("API_SERVER_KEY"),
                tracked_alive=tracked_alive,
            )
            self._apply_gateway_observation(inst, inspect)

            version = await self._version_label(session, inst.runtime_version_id)
            exe_ok = bool(exe_path and Path(exe_path).exists())
            await session.commit()
            resp = instance_to_response(inst, version)
            resp.executable_verified = exe_ok
            resp.api_server_enabled = self._api_server_enabled(secrets)
            return resp

    async def start_instance(self, instance_id: str) -> InstanceResponse:
        async with INSTANCE_OPERATION_LOCK.acquire(instance_id):
            return await self._start_instance_unlocked(instance_id)

    async def _start_instance_unlocked(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            # Desired state first (PRD v1.5 §34)
            if inst.desired_state != DesiredState.RUNNING.value:
                inst.desired_state = DesiredState.RUNNING.value
                logger.info("instance.desired_state.changed", instance_id=instance_id, desired="running")

            if inst.status in (InstanceStatus.STARTING.value, InstanceStatus.RUNNING.value):
                handle = self._process_manager.get_handle(instance_id)
                if handle and handle.is_alive():
                    await session.commit()
                    return await self.refresh_instance_status(instance_id)

            executable = await self._resolve_executable(session, inst)
            # PRD §32/§33 — Ownership Reconcile / Safe Adoption before Start
            secrets_pre = await self._resolve_secrets(session, inst.profile_name)
            inspect = await self._ownership.inspect(
                inst,
                expected_executable=str(executable),
                api_key=secrets_pre.get("API_SERVER_KEY"),
                tracked_alive=bool(self._process_manager.get_handle(instance_id)),
            )
            if inspect.owned_or_adopted and (inspect.health_authenticated or (inspect.health and inspect.health.healthy)):
                await self._apply_adoption(session, inst, inspect, source=inspect.reason or "start_adopt")
                await session.commit()
                version = await self._version_label(session, inst.runtime_version_id)
                resp = instance_to_response(inst, version)
                resp.executable_verified = True
                resp.api_server_enabled = self._api_server_enabled(secrets_pre)
                return resp
            if inspect.state in (OwnershipState.CONFLICT, OwnershipState.FOREIGN):
                inst.ownership_state = inspect.state.value
                inst.status = InstanceStatus.ERROR.value
                inst.healthy = False
                inst.last_error_code = "GATEWAY_PORT_OWNERSHIP_CONFLICT"
                inst.last_error = inspect.reason
                if inspect.health and inspect.health.healthy:
                    inst.api_state = GatewayApiState.HEALTHY.value
                await session.commit()
                raise RuntimeServiceError(
                    f"Gateway port {inst.gateway_port} ownership conflict",
                    code="gateway_port_conflict",
                    details={"ownership": inspect.state.value, "reason": inspect.reason},
                )

            await self._check_port_for_start(inst)
            ensure_profile_home(self._settings, inst.profile_name)

            from services.secret_service import SecretService

            await SecretService(self._settings, session).ensure_api_server_key(inst.profile_name)
            await session.flush()
            secrets = await self._resolve_secrets(session, inst.profile_name)
            if not (secrets.get("API_SERVER_KEY") or "").strip():
                raise RuntimeServiceError(
                    "API_SERVER_KEY is required before starting gateway",
                    code="secret_store_unavailable",
                )

            inst.status = InstanceStatus.STARTING.value
            inst.process_state = GatewayProcessState.STARTING.value
            inst.last_error = None
            inst.last_error_code = None
            inst.last_transition_at = self._now()
            await session.commit()

            try:
                await self._process_manager.start(
                    inst.id,
                    inst.profile_name,
                    inst.gateway_port,
                    mock_command=self._mock_command,
                    hermes_executable=str(executable),
                    secrets=secrets,
                )
                handle = self._process_manager.get_handle(inst.id)
                self._persist_fingerprint(inst, handle=handle, executable=str(executable))
                inst.process_state = GatewayProcessState.ALIVE.value
                await session.commit()

                health = await self._wait_for_health(
                    inst.gateway_port,
                    api_key=secrets.get("API_SERVER_KEY"),
                )
                if not health.healthy:
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.api_state = (
                        GatewayApiState.UNAUTHORIZED.value
                        if health.error_code == "GATEWAY_AUTH_FAILED"
                        else GatewayApiState.UNREACHABLE.value
                    )
                    inst.last_error = health.error_code or "Gateway health check failed"
                    inst.last_error_code = health.error_code
                    await session.commit()
                    raise RuntimeServiceError(
                        f"Gateway on port {inst.gateway_port} failed health check",
                        code="gateway_health_failed",
                        details={"errorCode": health.error_code},
                    )

                inst.status = InstanceStatus.RUNNING.value
                inst.healthy = True
                inst.api_state = GatewayApiState.HEALTHY.value
                inst.last_healthy_at = self._now()
                inst.last_health_check_at = self._now()
                inst.consecutive_health_failures = 0
                inst.consecutive_health_successes = 1
                inst.last_transition_at = self._now()
                await session.commit()
                SUPERVISOR_METRICS.set_up(inst.id, True, profile=inst.profile_name, port=inst.gateway_port)
                version = await self._version_label(session, inst.runtime_version_id)
                resp = instance_to_response(inst, version)
                resp.executable_verified = True
                resp.api_server_enabled = self._api_server_enabled(secrets)
                return resp
            except RuntimeServiceError:
                raise
            except Exception as exc:
                inst.status = InstanceStatus.ERROR.value
                inst.healthy = False
                inst.last_error = str(exc)
                inst.last_error_code = "gateway_start_failed"
                await session.commit()
                raise RuntimeServiceError(
                    f"Failed to start instance gateway: {exc}",
                    code="gateway_start_failed",
                    details={"reason": str(exc)},
                ) from exc

    async def stop_instance(self, instance_id: str) -> InstanceResponse:
        async with INSTANCE_OPERATION_LOCK.acquire(instance_id):
            return await self._stop_instance_unlocked(instance_id)

    async def _stop_instance_unlocked(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            inst.desired_state = DesiredState.STOPPED.value
            logger.info("instance.desired_state.changed", instance_id=instance_id, desired="stopped")
            inst.status = InstanceStatus.STOPPING.value
            await session.commit()

            exe_path: str | None = None
            try:
                exe_path = str(await self._resolve_executable(session, inst))
            except RuntimeServiceError:
                pass

            inspect = await self._ownership.inspect(
                inst,
                expected_executable=exe_path,
                api_key=(await self._resolve_secrets(session, inst.profile_name)).get("API_SERVER_KEY"),
                probe_health=False,
                tracked_alive=bool(self._process_manager.get_handle(instance_id)),
            )
            if inspect.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT, OwnershipState.UNKNOWN):
                # Unknown with no live process can stop DB state; foreign/conflict refuse kill
                listener = inspect.listener_pid or inst.gateway_listener_pid or inst.pid
                if inspect.state != OwnershipState.UNKNOWN or (listener and is_pid_alive(listener)):
                    if inspect.state != OwnershipState.UNKNOWN:
                        raise RuntimeServiceError(
                            "Gateway is not owned by this Runtime; refuse stop",
                            code="GATEWAY_NOT_OWNED",
                            details={"ownership": inspect.state.value},
                        )

            await self._process_manager.stop(
                inst.id,
                pid=inst.gateway_listener_pid or inst.pid,
                port=inst.gateway_port,
                process_create_time=inst.gateway_listener_create_time or inst.process_create_time,
                expected_executable=exe_path,
                kill_unknown_port_listeners=False,
                listener_pid=inst.gateway_listener_pid,
                listener_create_time=inst.gateway_listener_create_time,
            )
            # Only kill recorded listener when ownership verified
            target = inst.gateway_listener_pid or inst.pid
            if target and is_pid_alive(target) and inspect.owned_or_adopted:
                await asyncio.to_thread(terminate_pid, target)
            elif target and is_pid_alive(target) and not inspect.owned_or_adopted:
                logger.warning(
                    "gateway_stop_skip_foreign_pid",
                    instance_id=instance_id,
                    pid=target,
                    ownership=inspect.state.value,
                )

            inst.status = InstanceStatus.STOPPED.value
            inst.healthy = False
            self._clear_fingerprint(inst)
            inst.process_state = GatewayProcessState.MISSING.value
            inst.api_state = GatewayApiState.UNKNOWN.value
            inst.last_error = None
            inst.last_error_code = None
            inst.last_transition_at = self._now()
            await session.commit()
            SUPERVISOR_METRICS.set_up(inst.id, False, profile=inst.profile_name, port=inst.gateway_port)
            version = await self._version_label(session, inst.runtime_version_id)
            return instance_to_response(inst, version)

    async def restart_instance(self, instance_id: str) -> InstanceResponse:
        async with INSTANCE_OPERATION_LOCK.acquire(instance_id):
            async with self._session_maker() as session:
                inst = await self._load_instance(session, instance_id)
                inspect = await self._ownership.inspect(
                    inst,
                    expected_executable=getattr(inst, "gateway_executable_path", None),
                    probe_health=False,
                    tracked_alive=bool(self._process_manager.get_handle(instance_id)),
                )
                if not inspect.owned_or_adopted and inst.pid and is_pid_alive(inst.pid):
                    raise RuntimeServiceError(
                        "Gateway is not owned by this Runtime; refuse restart",
                        code="GATEWAY_NOT_OWNED",
                        details={"ownership": inspect.state.value},
                    )
                inst.desired_state = DesiredState.RUNNING.value
                await session.commit()
            await self._stop_instance_unlocked(instance_id)
            async with self._session_maker() as session:
                inst = await self._load_instance(session, instance_id)
                port = inst.gateway_port
                inst.desired_state = DesiredState.RUNNING.value
                await session.commit()
            deadline = time.monotonic() + 5.0
            while time.monotonic() < deadline:
                if is_port_available("127.0.0.1", port):
                    break
                await asyncio.sleep(0.2)
            return await self._start_instance_unlocked(instance_id)

    async def _apply_adoption(
        self,
        session: AsyncSession,
        inst: HermesInstance,
        inspect: GatewayOwnershipResult,
        *,
        source: str,
    ) -> None:
        """Mark instance as adopted/owned after verified recovery."""
        self._apply_gateway_observation(inst, inspect, persist_listener_upgrade=True)
        if inspect.pid is not None:
            inst.pid = inspect.pid
            inst.gateway_listener_pid = inspect.listener_pid or inspect.pid
        if inspect.launcher_pid is not None:
            inst.gateway_launcher_pid = inspect.launcher_pid
        if inspect.process_alive and (inspect.listener_pid or inspect.pid):
            try:
                import psutil

                target = inspect.listener_pid or inspect.pid
                if target:
                    ct = float(psutil.Process(target).create_time())
                    inst.process_create_time = ct
                    inst.gateway_listener_create_time = ct
            except Exception:
                pass
        inst.ownership_state = (
            OwnershipState.ADOPTED.value
            if inspect.state == OwnershipState.ADOPTED
            else OwnershipState.OWNED.value
        )
        inst.process_state = GatewayProcessState.ALIVE.value
        if inspect.health_authenticated or (inspect.health and inspect.health.healthy):
            inst.api_state = GatewayApiState.HEALTHY.value
            inst.healthy = True
            inst.status = InstanceStatus.RUNNING.value
            inst.last_healthy_at = self._now()
            inst.last_error = None
            inst.last_error_code = None
        elif inspect.health and inspect.health.error_code == "GATEWAY_AUTH_FAILED":
            inst.api_state = GatewayApiState.UNAUTHORIZED.value
            inst.healthy = False
            inst.status = InstanceStatus.ERROR.value
            inst.last_error_code = "GATEWAY_AUTH_FAILED"
        inst.last_health_check_at = self._now()
        inst.gateway_started_by_runtime = True
        if not inst.gateway_owner_runtime_id:
            inst.gateway_owner_runtime_id = self._runtime_instance_id
        if inspect.upgrade_to_v2:
            inst.gateway_fingerprint_version = GATEWAY_FINGERPRINT_VERSION
        if inspect.safe_to_adopt:
            logger.info(
                "gateway.process.safe_adopted",
                instance_id=inst.id,
                pid=inst.pid,
                port=inst.gateway_port,
                reason=source,
                deployment_mode=self._settings.deployment_mode,
            )
        else:
            logger.info(
                "gateway.process.adopted",
                instance_id=inst.id,
                pid=inst.pid,
                source=source,
            )
            logger.info(
                "gateway.ownership.restored",
                instance_id=inst.id,
                pid=inst.pid,
                port=inst.gateway_port,
                source="listener-fingerprint" if inspect.listener_pid else "persistent_fingerprint",
            )

    async def reconcile_instances_on_boot(self) -> None:
        """Boot reconcile v2 (PRD v1.5.1 §12–18): fingerprint → adopt / start / conflict."""
        async with self._session_maker() as session:
            result = await session.execute(select(HermesInstance))
            instances = list(result.scalars().all())
            for inst in instances:
                if not getattr(inst, "desired_state", None):
                    inst.desired_state = (
                        DesiredState.RUNNING.value if inst.auto_start else DesiredState.STOPPED.value
                    )
                desired = inst.desired_state or (
                    DesiredState.RUNNING.value if inst.auto_start else DesiredState.STOPPED.value
                )

                exe_path: str | None = None
                try:
                    exe_path = str(await self._resolve_executable(session, inst))
                except RuntimeServiceError:
                    pass
                secrets = await self._resolve_secrets(session, inst.profile_name)
                handle = self._process_manager.get_handle(inst.id)
                inspect = await self._ownership.inspect(
                    inst,
                    expected_executable=exe_path or getattr(inst, "gateway_executable_path", None),
                    api_key=secrets.get("API_SERVER_KEY"),
                    tracked_alive=bool(handle and handle.is_alive()),
                )

                # desired=stopped + valid owned → stop
                if desired == DesiredState.STOPPED.value:
                    if inspect.owned_or_adopted:
                        await session.commit()
                        try:
                            await self._stop_instance_unlocked(inst.id)
                        except Exception as exc:
                            logger.warning("reconcile_stop_failed", instance_id=inst.id, error=str(exc))
                    continue

                if desired != DesiredState.RUNNING.value:
                    continue

                # Case A / Safe Adoption: adopt
                if inspect.owned_or_adopted:
                    await self._apply_adoption(
                        session,
                        inst,
                        inspect,
                        source=inspect.reason or "boot_reconcile",
                    )
                    continue

                # Case B: stale + port free → clear fingerprint (start later via autostart)
                if inspect.state == OwnershipState.STALE:
                    port_free = is_port_available("127.0.0.1", inst.gateway_port)
                    if port_free:
                        self._clear_fingerprint(inst)
                        inst.process_state = GatewayProcessState.MISSING.value
                        inst.status = InstanceStatus.STOPPED.value
                        inst.healthy = False
                        logger.info("gateway.ownership.stale", instance_id=inst.id, action="clear")
                    else:
                        # Case D — evaluate listener via inspect already; fall through
                        pass
                    if inspect.state == OwnershipState.STALE and port_free:
                        continue

                # Case E / conflict / foreign
                if inspect.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT):
                    self._apply_gateway_observation(inst, inspect)
                    logger.warning(
                        "gateway.ownership.conflict",
                        instance_id=inst.id,
                        ownership=inspect.state.value,
                        reason=inspect.reason,
                    )
                    continue

                # No fingerprint / unknown + free → leave for autostart
                if is_port_available("127.0.0.1", inst.gateway_port):
                    if inspect.state == OwnershipState.STALE:
                        self._clear_fingerprint(inst)
                    inst.status = InstanceStatus.STOPPED.value if not inst.pid else inst.status
                    continue

            await session.commit()

    async def reconcile_instance(self, instance_id: str) -> dict:
        """POST reconcile — re-inspect ownership; never force adopt/kill (PRD §69)."""
        async with INSTANCE_OPERATION_LOCK.acquire(instance_id):
            async with self._session_maker() as session:
                inst = await self._load_instance(session, instance_id)
                exe_path: str | None = None
                try:
                    exe_path = str(await self._resolve_executable(session, inst))
                except RuntimeServiceError:
                    exe_path = getattr(inst, "gateway_executable_path", None)
                secrets = await self._resolve_secrets(session, inst.profile_name)
                handle = self._process_manager.get_handle(instance_id)
                inspect = await self._ownership.inspect(
                    inst,
                    expected_executable=exe_path,
                    api_key=secrets.get("API_SERVER_KEY"),
                    tracked_alive=bool(handle and handle.is_alive()),
                )
                if inspect.owned_or_adopted:
                    await self._apply_adoption(session, inst, inspect, source="api_reconcile")
                elif inspect.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT):
                    self._apply_gateway_observation(inst, inspect)
                elif inspect.state == OwnershipState.STALE:
                    if is_port_available("127.0.0.1", inst.gateway_port):
                        self._clear_fingerprint(inst)
                else:
                    self._apply_gateway_observation(inst, inspect)
                await session.commit()
                eligible = bool(
                    inst.healthy
                    and inst.ownership_state
                    in (OwnershipState.OWNED.value, OwnershipState.ADOPTED.value)
                    and inst.api_state == GatewayApiState.HEALTHY.value
                )
                return {
                    "instanceId": inst.id,
                    "ownership": inst.ownership_state,
                    "processState": inst.process_state,
                    "gatewayState": inst.api_state,
                    "executionEligible": eligible,
                    "reason": inspect.reason,
                }

    async def start_auto_start_instances(self) -> list[InstanceResponse]:
        async with self._session_maker() as session:
            result = await session.execute(
                select(HermesInstance).where(
                    (HermesInstance.desired_state == DesiredState.RUNNING.value)
                    | (HermesInstance.auto_start.is_(True))
                )
            )
            targets = [
                i
                for i in result.scalars().all()
                if i.status not in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value)
                or not i.healthy
            ]
            # Skip ownership conflicts — do not spawn second Gateway
            ids = [
                i.id
                for i in targets
                if i.status not in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value)
                and i.ownership_state
                not in (OwnershipState.CONFLICT.value, OwnershipState.FOREIGN.value)
            ]

        results: list[InstanceResponse] = []
        for instance_id in ids:
            try:
                results.append(await self.start_instance(instance_id))
            except Exception as exc:
                logger.warning("instance_autostart_failed", instance_id=instance_id, error=str(exc))
        return results

    async def shutdown_all_instances(self, *, preserve: bool = False) -> None:
        """Stop or detach all instances.

        When ``preserve=True`` (dev reload), drop in-memory handles without killing Gateways.
        """
        if preserve:
            self._process_manager.detach_all()
            logger.info("gateway_instances_detached_for_reload")
            return
        async with self._session_maker() as session:
            result = await session.execute(select(HermesInstance))
            instances = list(result.scalars().all())
            ids = [
                i.id
                for i in instances
                if i.status in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value) or i.pid
            ]
        for instance_id in ids:
            try:
                await self.stop_instance(instance_id)
            except Exception as exc:
                logger.warning("instance_shutdown_failed", instance_id=instance_id, error=str(exc))

    def detach_all_instances(self) -> None:
        self._process_manager.detach_all()

    # Error codes that must never trigger automatic restart (PRD Phase 5 / §32).
    _NO_AUTO_RESTART_CODES = frozenset(
        {
            "GATEWAY_AUTH_FAILED",
            "GATEWAY_PORT_OWNERSHIP_CONFLICT",
            "GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
            "GATEWAY_CRASH_LOOP",
            "configuration_invalid",
        }
    )

    def _within_restart_budget(self, inst: HermesInstance) -> bool:
        """DB-backed restart budget (survives Runtime restart).

        Sliding window uses ``last_transition_at`` as last auto-restart marker.
        ``restart_count`` is the in-window counter; expires when window elapses.
        """
        if (inst.last_error_code or "") == "GATEWAY_CRASH_LOOP":
            return False
        window = float(self._settings.gateway_restart_window_seconds)
        max_restarts = int(self._settings.gateway_max_restarts)
        now = self._now()
        last = inst.last_transition_at
        if last is not None:
            # Normalize naive timestamps
            if last.tzinfo is None:
                last = last.replace(tzinfo=UTC)
            age = (now - last).total_seconds()
            if age > window:
                # Window expired — budget resets (caller may zero restart_count).
                return True
        return int(inst.restart_count or 0) < max_restarts

    def _record_restart(self, instance_id: str) -> None:
        # Keep in-process hint for same-tick probes; DB is source of truth.
        stamps = _restart_timestamps.setdefault(instance_id, [])
        stamps.append(time.monotonic())

    async def probe_and_recover(self, instance_id: str) -> None:
        """Health worker tick for one instance (PRD §24–32)."""
        async with INSTANCE_OPERATION_LOCK.acquire(instance_id):
            await self._probe_and_recover_unlocked(instance_id)

    async def _probe_and_recover_unlocked(self, instance_id: str) -> None:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            desired = inst.desired_state or DesiredState.STOPPED.value
            if desired != DesiredState.RUNNING.value and inst.status not in (
                InstanceStatus.RUNNING.value,
                InstanceStatus.STARTING.value,
            ):
                return

            exe_path: str | None = None
            try:
                exe_path = str(await self._resolve_executable(session, inst))
            except RuntimeServiceError:
                pass

            secrets = await self._resolve_secrets(session, inst.profile_name)
            handle = self._process_manager.get_handle(instance_id)
            tracked_alive = bool(handle and handle.is_alive())

            # Capture permanent block codes before observation may rewrite last_error_code.
            prior_error_code = (inst.last_error_code or "").strip()

            # PRD §42 — always re-inspect current facts before recovery policy.
            inspect = await self._ownership.inspect(
                inst,
                expected_executable=exe_path,
                api_key=secrets.get("API_SERVER_KEY"),
                tracked_alive=tracked_alive,
            )
            self._apply_gateway_observation(inst, inspect)

            # Conflict/foreign: do not treat as exited; block auto-restart but keep process_state.
            if inspect.state in (OwnershipState.FOREIGN, OwnershipState.CONFLICT):
                await session.commit()
                logger.warning(
                    "gateway.ownership.conflict",
                    instance_id=instance_id,
                    ownership=inspect.state.value,
                    reason=inspect.reason,
                )
                return

            # Owned/adopted + healthy — conflict auto-cleared by _apply_gateway_observation.
            if inspect.owned_or_adopted:
                if inspect.health and inspect.health.error_code == "GATEWAY_AUTH_FAILED":
                    logger.warning("gateway.auth.failed", instance_id=instance_id)
                await session.commit()
                return

            # PRD §37 — only STALE / confirmed listener gone → exited recovery path.
            process_exited = (
                desired == DesiredState.RUNNING.value
                and inspect.state == OwnershipState.STALE
            )
            if (
                desired == DesiredState.RUNNING.value
                and inspect.process_state == GatewayProcessState.EXITED
                and inspect.state == OwnershipState.STALE
            ):
                process_exited = True

            if not process_exited:
                await session.commit()
                return

            # Historical last_error_code must not skip re-inspect (already done above).
            # Permanent block codes (auth/config/crash-loop) still suppress auto-restart.
            # Conflict codes are excluded so recovered ownership can clear them.
            blocked_code = prior_error_code
            if blocked_code in self._NO_AUTO_RESTART_CODES and blocked_code not in (
                "GATEWAY_PORT_OWNERSHIP_CONFLICT",
                "GATEWAY_PROCESS_OWNERSHIP_CONFLICT",
            ):
                inst.process_state = GatewayProcessState.EXITED.value
                inst.status = InstanceStatus.ERROR.value
                inst.healthy = False
                inst.last_error_code = blocked_code
                inst.last_error = inst.last_error or f"Auto recovery blocked: {blocked_code}"
                await session.commit()
                logger.warning(
                    "gateway.recovery.failed",
                    instance_id=instance_id,
                    reason=blocked_code,
                )
                return

            SUPERVISOR_METRICS.inc_crash(inst.id, profile=inst.profile_name, port=inst.gateway_port)
            logger.info(
                "gateway.process.exited",
                instance_id=instance_id,
                pid=inst.gateway_listener_pid or inst.pid,
                source="listener_fingerprint_stale",
            )
            await session.commit()

            if not self._settings.gateway_auto_recovery_enabled:
                async with self._session_maker() as s2:
                    row = await self._load_instance(s2, instance_id)
                    row.status = InstanceStatus.ERROR.value
                    row.healthy = False
                    row.last_error_code = "GATEWAY_PROCESS_STALE"
                    row.last_error = "Gateway process exited; auto recovery disabled"
                    await s2.commit()
                return

            async with self._session_maker() as s_budget:
                row_b = await self._load_instance(s_budget, instance_id)
                window = float(self._settings.gateway_restart_window_seconds)
                last = row_b.last_transition_at
                if last is not None:
                    if last.tzinfo is None:
                        last = last.replace(tzinfo=UTC)
                    if (self._now() - last).total_seconds() > window:
                        row_b.restart_count = 0
                        await s_budget.commit()
                else:
                    await s_budget.commit()

            async with self._session_maker() as s_check:
                row_check = await self._load_instance(s_check, instance_id)
                if not self._within_restart_budget(row_check):
                    row_check.status = InstanceStatus.ERROR.value
                    row_check.healthy = False
                    row_check.last_error_code = "GATEWAY_CRASH_LOOP"
                    row_check.last_error = (
                        f"Gateway crashed {self._settings.gateway_max_restarts} times "
                        f"in {int(self._settings.gateway_restart_window_seconds)}s; auto restart paused"
                    )
                    row_check.last_transition_at = self._now()
                    await s_check.commit()
                    logger.warning("gateway.recovery.failed", instance_id=instance_id, reason="crash_loop")
                    return

            logger.info("gateway.recovery.started", instance_id=instance_id)
            self._record_restart(instance_id)
            try:
                async with self._session_maker() as s2:
                    row = await self._load_instance(s2, instance_id)
                    self._clear_fingerprint(row)
                    row.desired_state = DesiredState.RUNNING.value
                    row.restart_count = int(row.restart_count or 0) + 1
                    row.last_transition_at = self._now()
                    await s2.commit()
                SUPERVISOR_METRICS.inc_restart(
                    instance_id, profile=inst.profile_name, port=inst.gateway_port
                )
                await self._start_instance_unlocked(instance_id)
                logger.info("gateway.recovery.completed", instance_id=instance_id)
            except Exception as exc:
                logger.warning("gateway.recovery.failed", instance_id=instance_id, error=str(exc))
            return

    async def get_detailed_health(self, instance_id: str) -> dict:
        """Build InstanceHealthResponse payload."""
        await self.refresh_instance_status(instance_id)
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            version = await self._version_label(session, inst.runtime_version_id)
            exe_ok = False
            try:
                path = await self._resolve_executable(session, inst)
                exe_ok = path.exists()
            except RuntimeServiceError:
                pass
            owned = inst.ownership_state in (
                OwnershipState.OWNED.value,
                OwnershipState.ADOPTED.value,
            )
            secrets = await self._resolve_secrets(session, inst.profile_name)
            client = self._client_for(inst.gateway_port, secrets)
            health = await client.health_check()
            return {
                "instanceId": inst.id,
                "runtime": {
                    "version": version,
                    "executableVerified": exe_ok,
                },
                "process": {
                    "state": inst.process_state,
                    "pid": inst.pid,
                    "owned": owned,
                },
                "gateway": {
                    "port": inst.gateway_port,
                    "reachable": health.reachable,
                    "authenticated": health.authenticated,
                    "healthy": health.healthy,
                    "latencyMs": health.latency_ms,
                },
                "ownershipState": inst.ownership_state,
                "executionEligible": bool(
                    health.healthy
                    and owned
                ),
                "checkedAt": (inst.last_health_check_at or self._now()).isoformat(),
            }

    async def get_state(self, instance_id: str) -> dict:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            owned = inst.ownership_state in (
                OwnershipState.OWNED.value,
                OwnershipState.ADOPTED.value,
            )
            eligible = bool(
                inst.healthy
                and owned
                and inst.api_state == GatewayApiState.HEALTHY.value
            )
            return {
                "instanceId": inst.id,
                "desired": {
                    "state": inst.desired_state,
                },
                "observed": {
                    "status": inst.status,
                    "healthy": inst.healthy,
                    "processState": inst.process_state,
                    "apiState": inst.api_state,
                    "ownershipState": inst.ownership_state,
                    "ownershipSource": (
                        "listener-fingerprint"
                        if inst.gateway_listener_pid and inst.ownership_state == OwnershipState.ADOPTED.value
                        else (
                            "persistent-fingerprint"
                            if inst.ownership_state == OwnershipState.ADOPTED.value
                            else ("tracked-handle" if owned else None)
                        )
                    ),
                    "pid": inst.pid,
                    "launcherPid": inst.gateway_launcher_pid,
                    "listenerPid": inst.gateway_listener_pid or inst.pid,
                    "listenerCreateTime": inst.gateway_listener_create_time or inst.process_create_time,
                    "processCreateTime": inst.process_create_time,
                    "lastHealthCheckAt": inst.last_health_check_at.isoformat()
                    if inst.last_health_check_at
                    else None,
                    "lastHealthyAt": inst.last_healthy_at.isoformat() if inst.last_healthy_at else None,
                },
                "executionEligible": eligible,
                "recovery": {
                    "restartCount": inst.restart_count,
                    "consecutiveHealthFailures": inst.consecutive_health_failures,
                    "consecutiveHealthSuccesses": inst.consecutive_health_successes,
                    "lastErrorCode": inst.last_error_code,
                    "lastError": inst.last_error,
                },
            }

    async def get_diagnostics(self, instance_id: str) -> dict:
        state = await self.get_state(instance_id)
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            version = await self._version_label(session, inst.runtime_version_id)
            exe: str | None = None
            try:
                exe = str(await self._resolve_executable(session, inst))
            except RuntimeServiceError as exc:
                exe = None
                err = str(exc)
            else:
                err = None
            expected_pid = inst.gateway_listener_pid or inst.pid
            port_result = check_port_ownership(inst.gateway_port, expected_pid=expected_pid)
            handle = self._process_manager.get_handle(instance_id)
            log_path = None
            if handle and handle.log_path:
                log_path = str(handle.log_path)
            else:
                log_path = str(self._settings.log_dir_path / f"gateway-{inst.profile_name}.log")
            secrets = await self._resolve_secrets(session, inst.profile_name)
            inspect = await self._ownership.inspect(
                inst,
                expected_executable=exe or getattr(inst, "gateway_executable_path", None),
                api_key=secrets.get("API_SERVER_KEY"),
                tracked_alive=bool(handle and handle.is_alive()),
            )
            evidence = inspect.evidence
            launcher_alive = bool(
                inst.gateway_launcher_pid and is_pid_alive(inst.gateway_launcher_pid)
            )
            return {
                **state,
                "runtimeVersion": version,
                "executable": exe,
                "executableError": err,
                "profile": inst.profile_name,
                "port": inst.gateway_port,
                "portOwner": {
                    "state": port_result.state.value,
                    "pids": port_result.pids,
                },
                "launcher": {
                    "pid": inst.gateway_launcher_pid,
                    "createTime": inst.gateway_launcher_create_time,
                    "alive": launcher_alive,
                },
                "listener": {
                    "pid": inst.gateway_listener_pid or inst.pid,
                    "createTime": inst.gateway_listener_create_time or inst.process_create_time,
                    "executablePath": inst.gateway_listener_executable_path,
                    "alive": inspect.listener_alive,
                    "port": inst.gateway_port,
                    "portMatch": inspect.port_match or inspect.port_owned_by_process,
                },
                "lineage": {
                    "verifiedAtLaunch": inspect.lineage_match,
                    "match": inspect.lineage_match,
                },
                "ownership": {
                    "state": inspect.state.value,
                    "source": inspect.reason,
                },
                "gateway": {
                    "healthy": bool(inspect.health and inspect.health.healthy),
                    "authenticated": inspect.health_authenticated,
                },
                "fingerprint": {
                    "pid": inst.pid,
                    "processCreateTime": inst.process_create_time,
                    "executablePath": getattr(inst, "gateway_executable_path", None),
                    "commandHash": getattr(inst, "gateway_command_hash", None),
                    "startedAt": inst.gateway_started_at.isoformat()
                    if getattr(inst, "gateway_started_at", None)
                    else None,
                    "ownerRuntimeId": getattr(inst, "gateway_owner_runtime_id", None),
                    "version": getattr(inst, "gateway_fingerprint_version", None),
                    "launcherPid": inst.gateway_launcher_pid,
                    "listenerPid": inst.gateway_listener_pid,
                },
                "liveInspection": {
                    "pid": inspect.pid,
                    "launcherPid": inspect.launcher_pid,
                    "listenerPid": inspect.listener_pid,
                    "listeningPids": list(inspect.listening_pids),
                    "createTimeMatch": inspect.create_time_match,
                    "executableMatch": inspect.executable_match,
                    "commandMatch": inspect.command_match,
                    "profileMatch": inspect.profile_match,
                    "lineageMatch": inspect.lineage_match,
                    "healthAuthenticated": inspect.health_authenticated,
                    "safeToAdopt": inspect.safe_to_adopt,
                    "reason": inspect.reason,
                },
                "safeAdoptionEvidence": evidence.__dict__ if evidence else None,
                "gatewayLogPath": log_path,
            }

    async def list_managed_instance_ids_for_health(self) -> list[str]:
        async with self._session_maker() as session:
            result = await session.execute(select(HermesInstance))
            out: list[str] = []
            for inst in result.scalars().all():
                desired = inst.desired_state or DesiredState.STOPPED.value
                if desired == DesiredState.RUNNING.value or inst.status in (
                    InstanceStatus.RUNNING.value,
                    InstanceStatus.STARTING.value,
                ):
                    out.append(inst.id)
            return out
