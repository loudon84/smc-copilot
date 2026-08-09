from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_enums import DesiredState, InstanceStatus
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, RuntimeVersion
from db.repositories.runtime_repo import RuntimeVersionRepository
from runtime.port_allocator import allocate_port, is_port_available
from schemas.runtime import InstanceCreateRequest, InstanceResponse, InstanceUpdateRequest

if TYPE_CHECKING:
    from services.gateway_supervisor import GatewaySupervisor


def instance_to_response(inst: HermesInstance, version: str | None = None) -> InstanceResponse:
    return InstanceResponse(
        id=inst.id,
        name=inst.name,
        profileName=inst.profile_name,
        runtimeVersion=version,
        gatewayPort=inst.gateway_port,
        status=inst.status,
        healthy=inst.healthy,
        autoStart=inst.auto_start,
        pid=inst.pid,
        lastError=inst.last_error,
    )


class InstanceService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        *,
        supervisor: GatewaySupervisor | None = None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._supervisor = supervisor
        self._versions = RuntimeVersionRepository(session)

    async def _version_label(self, runtime_version_id: str | None) -> str | None:
        if not runtime_version_id:
            return None
        row = await self._versions.get_by_id(runtime_version_id)
        return row.version if row else None

    async def list_instances(self) -> list[InstanceResponse]:
        result = await self._session.execute(select(HermesInstance).order_by(HermesInstance.created_at.asc()))
        rows = list(result.scalars().all())
        out: list[InstanceResponse] = []
        for row in rows:
            out.append(instance_to_response(row, await self._version_label(row.runtime_version_id)))
        return out

    async def get(self, instance_id: str) -> HermesInstance:
        row = await self._session.get(HermesInstance, instance_id)
        if row is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        return row

    async def get_response(self, instance_id: str) -> InstanceResponse:
        row = await self.get(instance_id)
        return instance_to_response(row, await self._version_label(row.runtime_version_id))

    async def _used_ports(self) -> set[int]:
        result = await self._session.execute(select(HermesInstance.gateway_port))
        return {int(p) for p in result.scalars().all()}

    async def create(self, body: InstanceCreateRequest) -> InstanceResponse:
        existing = await self._session.execute(select(HermesInstance).where(HermesInstance.name == body.name))
        if existing.scalar_one_or_none():
            raise RuntimeServiceError(f"Instance name already exists: {body.name}", code="conflict")

        runtime_version_id = None
        version_label = None
        if body.runtime_version:
            ver = await self._versions.get_by_version(body.runtime_version)
            if ver is None:
                raise RuntimeServiceError(f"Runtime version not found: {body.runtime_version}", code="not_found")
            runtime_version_id = ver.id
            version_label = ver.version
        else:
            active = await self._versions.get_active()
            if active:
                runtime_version_id = active.id
                version_label = active.version

        used = await self._used_ports()
        try:
            port = allocate_port(self._settings, body.gateway_port, used)
        except ValueError as exc:
            raise RuntimeServiceError(str(exc), code="conflict") from exc

        inst = HermesInstance(
            name=body.name,
            profile_name=body.profile_name or body.name,
            runtime_version_id=runtime_version_id,
            gateway_port=port,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=body.auto_start,
            desired_state=DesiredState.RUNNING.value if body.auto_start else DesiredState.STOPPED.value,
        )
        self._session.add(inst)
        await self._session.flush()
        # FR-08: ensure API_SERVER_KEY exists for the profile scope
        from services.secret_service import SecretService

        await SecretService(self._settings, self._session).ensure_api_server_key(inst.profile_name)
        return instance_to_response(inst, version_label)

    async def update(self, instance_id: str, body: InstanceUpdateRequest) -> InstanceResponse:
        inst = await self.get(instance_id)
        if body.name is not None:
            inst.name = body.name
        if body.auto_start is not None:
            inst.auto_start = body.auto_start
            inst.desired_state = DesiredState.RUNNING.value if body.auto_start else DesiredState.STOPPED.value
        if body.gateway_port is not None:
            if body.gateway_port != inst.gateway_port and not is_port_available("127.0.0.1", body.gateway_port):
                raise RuntimeServiceError(f"Port {body.gateway_port} is not available", code="conflict")
            inst.gateway_port = body.gateway_port
        version_label = await self._version_label(inst.runtime_version_id)
        if body.runtime_version is not None:
            ver = await self._versions.get_by_version(body.runtime_version)
            if ver is None:
                raise RuntimeServiceError(f"Runtime version not found: {body.runtime_version}", code="not_found")
            inst.runtime_version_id = ver.id
            version_label = ver.version
        await self._session.flush()
        return instance_to_response(inst, version_label)

    async def delete(self, instance_id: str) -> None:
        inst = await self.get(instance_id)
        if inst.status in (InstanceStatus.RUNNING.value, InstanceStatus.STARTING.value):
            raise RuntimeServiceError("Stop instance before delete", code="invalid_state")
        await self._session.delete(inst)
        await self._session.flush()

    async def ensure_default(self, runtime_version_id: str) -> str:
        """Idempotently ensure the default Hermes instance exists and tracks the version.

        PRD v1.4.1 §28–§29 — shared by InstallationService and Dev Hermes registration.
        """
        result = await self._session.execute(select(HermesInstance).where(HermesInstance.name == "default"))
        existing = result.scalar_one_or_none()
        if existing:
            existing.runtime_version_id = runtime_version_id
            if not existing.auto_start:
                existing.auto_start = True
            existing.desired_state = DesiredState.RUNNING.value
            await self._session.flush()
            return existing.id
        inst = HermesInstance(
            name="default",
            profile_name="default",
            runtime_version_id=runtime_version_id,
            gateway_port=self._settings.default_gateway_port,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=True,
            desired_state=DesiredState.RUNNING.value,
        )
        self._session.add(inst)
        await self._session.flush()
        return inst.id

    async def resolve_executable(self, inst: HermesInstance) -> str | None:
        if inst.runtime_version_id:
            ver = await self._session.get(RuntimeVersion, inst.runtime_version_id)
            if ver:
                return ver.executable_path
        active = await self._versions.get_active()
        return active.executable_path if active else None

    async def start(self, instance_id: str) -> InstanceResponse:
        if self._supervisor is None:
            raise RuntimeServiceError("Gateway supervisor not available", code="internal_error")
        # v1.3.1: Instance-native start — must NOT call start_profile()
        return await self._supervisor.start_instance(instance_id)

    async def stop(self, instance_id: str) -> InstanceResponse:
        if self._supervisor is None:
            raise RuntimeServiceError("Gateway supervisor not available", code="internal_error")
        return await self._supervisor.stop_instance(instance_id)

    async def restart(self, instance_id: str) -> InstanceResponse:
        if self._supervisor is None:
            raise RuntimeServiceError("Gateway supervisor not available", code="internal_error")
        return await self._supervisor.restart_instance(instance_id)
