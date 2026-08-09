from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings, get_settings
from core.errors import instance_not_found
from core.runtime_enums import InstanceStatus
from db.models.runtime import HermesInstance, RuntimeVersion
from integrations.hermes.client_factory import HermesGatewayClientFactory
from runtime.hermes_profile_paths import profile_home
from schemas.chat import ResolvedInstance


class InstanceRefResolver:
    def __init__(
        self,
        session: AsyncSession,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()

    async def resolve(self, ref: str) -> ResolvedInstance:
        inst = await self._resolve_instance(ref)
        return await self._to_resolved(inst)

    async def require_instance(self, instance_id: str) -> HermesInstance:
        from runtime.local_hermes_profile_policy import require_supported_local_profile

        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise instance_not_found(instance_id=instance_id)
        require_supported_local_profile(inst.profile_name)
        return inst

    async def require_deployed_instance(self, instance_id: str) -> HermesInstance:
        inst = await self.require_instance(instance_id)
        home = profile_home(self._settings, inst.profile_name)
        if not home.is_dir():
            from core.errors import profile_not_deployed

            raise profile_not_deployed(instance_id=instance_id, profile_name=inst.profile_name)
        return inst

    async def _resolve_instance(self, ref: str) -> HermesInstance:
        ref = ref.strip()
        if not ref:
            raise instance_not_found()

        by_id = await self._session.get(HermesInstance, ref)
        if by_id is not None:
            return by_id

        by_name = await self._session.execute(select(HermesInstance).where(HermesInstance.name == ref).limit(1))
        inst = by_name.scalar_one_or_none()
        if inst is not None:
            return inst

        by_profile = await self._session.execute(
            select(HermesInstance).where(HermesInstance.profile_name == ref).limit(1)
        )
        inst = by_profile.scalar_one_or_none()
        if inst is not None:
            return inst

        if ref == "default":
            for stmt in (
                select(HermesInstance).where(HermesInstance.name == "default").limit(1),
                select(HermesInstance).where(HermesInstance.profile_name == "default").limit(1),
            ):
                result = await self._session.execute(stmt)
                inst = result.scalar_one_or_none()
                if inst is not None:
                    return inst

        raise instance_not_found(ref=ref)

    async def _to_resolved(self, inst: HermesInstance) -> ResolvedInstance:
        runtime_version: str | None = None
        if inst.runtime_version_id:
            ver = await self._session.get(RuntimeVersion, inst.runtime_version_id)
            if ver is not None:
                runtime_version = ver.version

        status = inst.status
        healthy = bool(inst.healthy)

        if status == InstanceStatus.RUNNING.value:
            client = await HermesGatewayClientFactory(self._settings, self._session).create_for_instance(
                inst.id,
                require_key=False,
            )
            health = await client.health_check()
            healthy = bool(health.healthy)
        elif status in (InstanceStatus.ERROR.value, InstanceStatus.FAILED.value):
            status = "failed"
        elif status == InstanceStatus.STARTING.value:
            status = "starting"
        elif status == InstanceStatus.STOPPED.value:
            status = "stopped"

        home = profile_home(self._settings, inst.profile_name)
        if not home.is_dir():
            status = "not_deployed"
            healthy = False

        return ResolvedInstance(
            instance_id=inst.id,
            name=inst.name,
            profile_name=inst.profile_name,
            runtime_version=runtime_version,
            gateway_port=inst.gateway_port,
            status=status,
            healthy=healthy,
        )
