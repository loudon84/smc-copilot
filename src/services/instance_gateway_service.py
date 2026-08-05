"""Instance-native Gateway lifecycle (v1.3.1 FR-05) — does not depend on profiles table."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import InstanceStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeVersion, SecretReference
from integrations.hermes.client import HermesGatewayClient
from runtime.gateway_process import GatewayProcessManager, find_pids_listening_on_port, is_pid_alive, terminate_pid
from runtime.hermes_profile_paths import ensure_profile_home
from runtime.port_allocator import is_port_available
from schemas.runtime import InstanceResponse
from services.instance_service import instance_to_response
from services.secret_service import SecretStore

logger = get_logger(__name__)


class InstanceGatewayService:
    def __init__(
        self,
        *,
        settings: Settings,
        session_maker: async_sessionmaker[AsyncSession],
        process_manager: GatewayProcessManager,
        mock_command: list[str] | None = None,
    ) -> None:
        self._settings = settings
        self._session_maker = session_maker
        self._process_manager = process_manager
        self._mock_command = mock_command
        self._secret_store = SecretStore(settings)

    def set_mock_gateway_command(self, cmd: list[str] | None) -> None:
        self._mock_command = cmd

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
            result = await session.execute(
                select(RuntimeVersion).where(RuntimeVersion.status == "active").limit(1)
            )
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
        """Load secrets only for this profile scope (FR-07 isolation — no default↔named borrow)."""
        from runtime.hermes_profile_paths import is_default_profile

        name = (profile_name or "default").strip() or "default"
        # Allowed scopes: exact profile name and profile:<name> alias only.
        # Do NOT merge "default"/"runtime" into named profiles.
        scope_ids = {name, f"profile:{name}"}
        if is_default_profile(name):
            # default profile may also use explicit scope aliases used by Secret API
            scope_ids.add("default")
        result = await session.execute(
            select(SecretReference).where(SecretReference.scope_id.in_(scope_ids))
        )
        out: dict[str, str] = {}
        for row in result.scalars().all():
            value = self._secret_store.get(row.storage_key)
            if value:
                out[row.secret_name] = value
        return out

    def _api_server_enabled(self, secrets: dict[str, str]) -> bool:
        return bool((secrets.get("API_SERVER_KEY") or "").strip())

    async def _check_port_for_start(self, inst: HermesInstance) -> None:
        port = inst.gateway_port
        if is_port_available("127.0.0.1", port):
            return
        listeners = find_pids_listening_on_port(port)
        if inst.pid and inst.pid in listeners:
            # Same PID still holding port — treat as recoverable by stop first
            return
        if listeners and inst.pid and all(pid == inst.pid for pid in listeners):
            return
        raise RuntimeServiceError(
            f"Gateway port {port} is occupied by another process",
            code="gateway_port_conflict",
            details={"port": port, "pids": listeners, "instancePid": inst.pid},
        )

    async def _wait_for_health(self, port: int) -> bool:
        client = HermesGatewayClient(port)
        timeout = float(self._settings.hermes_gateway_start_timeout_seconds)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await client.health_check():
                return True
            await asyncio.sleep(self._settings.gateway_health_poll_interval_sec)
        return False

    async def refresh_instance_status(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            handle = self._process_manager.get_handle(instance_id)
            alive = handle.is_alive() if handle else False
            pid = handle.pid if handle and alive else inst.pid

            healthy = False
            if inst.status == InstanceStatus.RUNNING.value:
                if pid and is_pid_alive(pid):
                    healthy = await HermesGatewayClient(inst.gateway_port).health_check()
                    if not healthy:
                        inst.status = InstanceStatus.ERROR.value
                        inst.healthy = False
                        inst.last_error = "Gateway health check failed"
                elif pid and not is_pid_alive(pid):
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.pid = None
                    inst.last_error = "Gateway process exited unexpectedly"
                elif alive:
                    healthy = await HermesGatewayClient(inst.gateway_port).health_check()
                    inst.healthy = healthy
                else:
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.last_error = "Gateway process not tracked"
            elif alive:
                inst.status = InstanceStatus.RUNNING.value
                healthy = await HermesGatewayClient(inst.gateway_port).health_check()
                inst.healthy = healthy
                inst.pid = pid

            if inst.status == InstanceStatus.RUNNING.value:
                inst.healthy = healthy or await HermesGatewayClient(inst.gateway_port).health_check()
                inst.pid = pid

            version = await self._version_label(session, inst.runtime_version_id)
            exe_ok = False
            try:
                path = await self._resolve_executable(session, inst)
                exe_ok = path.exists()
            except RuntimeServiceError:
                exe_ok = False
            await session.commit()
            secrets = await self._resolve_secrets(session, inst.profile_name)
            resp = instance_to_response(inst, version)
            resp.executable_verified = exe_ok
            resp.api_server_enabled = self._api_server_enabled(secrets)
            return resp

    async def start_instance(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            if inst.status in (InstanceStatus.STARTING.value, InstanceStatus.RUNNING.value):
                handle = self._process_manager.get_handle(instance_id)
                if handle and handle.is_alive():
                    await session.commit()
                    return await self.refresh_instance_status(instance_id)

            executable = await self._resolve_executable(session, inst)
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
            inst.last_error = None
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
                inst.pid = handle.pid if handle else None
                await session.commit()

                healthy = await self._wait_for_health(inst.gateway_port)
                if not healthy:
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.last_error = "Gateway health check failed"
                    await session.commit()
                    raise RuntimeServiceError(
                        f"Gateway on port {inst.gateway_port} failed health check",
                        code="gateway_health_failed",
                    )

                inst.status = InstanceStatus.RUNNING.value
                inst.healthy = True
                await session.commit()
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
                await session.commit()
                raise RuntimeServiceError(
                    f"Failed to start instance gateway: {exc}",
                    code="gateway_start_failed",
                    details={"reason": str(exc)},
                ) from exc

    async def stop_instance(self, instance_id: str) -> InstanceResponse:
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            await self._process_manager.stop(
                inst.id,
                pid=inst.pid,
                port=inst.gateway_port,
                kill_unknown_port_listeners=False,
            )
            # Only kill our recorded PID if still alive
            if inst.pid and is_pid_alive(inst.pid):
                await asyncio.to_thread(terminate_pid, inst.pid)
            inst.status = InstanceStatus.STOPPED.value
            inst.healthy = False
            inst.pid = None
            inst.last_error = None
            await session.commit()
            version = await self._version_label(session, inst.runtime_version_id)
            return instance_to_response(inst, version)

    async def restart_instance(self, instance_id: str) -> InstanceResponse:
        await self.stop_instance(instance_id)
        # brief wait for port release by our pid only
        async with self._session_maker() as session:
            inst = await self._load_instance(session, instance_id)
            port = inst.gateway_port
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if is_port_available("127.0.0.1", port):
                break
            await asyncio.sleep(0.2)
        return await self.start_instance(instance_id)

    async def reconcile_instances_on_boot(self) -> None:
        async with self._session_maker() as session:
            result = await session.execute(select(HermesInstance))
            instances = list(result.scalars().all())
            for inst in instances:
                if inst.status != InstanceStatus.RUNNING.value:
                    continue
                pid = inst.pid
                handle = self._process_manager.get_handle(inst.id)
                tracked = handle.is_alive() if handle else False
                if tracked:
                    continue
                if pid and is_pid_alive(pid):
                    healthy = await HermesGatewayClient(inst.gateway_port).health_check()
                    if healthy:
                        continue
                    await asyncio.to_thread(terminate_pid, pid)
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.last_error = "Reconciled: unhealthy gateway killed"
                    continue
                # PID missing
                if is_port_available("127.0.0.1", inst.gateway_port):
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.pid = None
                    inst.last_error = "Reconciled: process gone"
                else:
                    # Unknown occupant — mark error, do NOT kill
                    inst.status = InstanceStatus.ERROR.value
                    inst.healthy = False
                    inst.last_error = "Reconciled: port occupied by unknown process"
            await session.commit()

    async def start_auto_start_instances(self) -> list[InstanceResponse]:
        async with self._session_maker() as session:
            result = await session.execute(
                select(HermesInstance).where(HermesInstance.auto_start.is_(True))
            )
            targets = [
                i
                for i in result.scalars().all()
                if i.status not in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value)
            ]
            ids = [i.id for i in targets]

        results: list[InstanceResponse] = []
        for instance_id in ids:
            try:
                results.append(await self.start_instance(instance_id))
            except Exception as exc:
                logger.warning("instance_autostart_failed", instance_id=instance_id, error=str(exc))
        return results

    async def shutdown_all_instances(self) -> None:
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
