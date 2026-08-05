from __future__ import annotations

from pathlib import Path

from core.config import Settings, get_settings
from core.constants import GatewayStatus
from core.errors import profile_not_deployed, profile_not_found
from db.models.profile import Profile
from db.repositories.profile_repo import ProfileRepository
from integrations.hermes.client_factory import HermesGatewayClientFactory
from schemas.chat import ResolvedProfile


class ProfileRefResolver:
    def __init__(
        self,
        repo: ProfileRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._repo = repo
        self._settings = settings or get_settings()

    async def resolve(self, ref: str) -> ResolvedProfile:
        profile = await self._resolve_profile(ref)
        base_url = f"http://127.0.0.1:{profile.gateway_port}"
        status = profile.status
        healthy = False

        if status == GatewayStatus.ERROR.value:
            status = "failed"
        elif status == GatewayStatus.STARTING.value:
            status = "starting"
        elif status == GatewayStatus.RUNNING.value:
            client = await HermesGatewayClientFactory(self._settings, self._repo._session).create_for_profile_name(
                profile.name,
                profile.gateway_port,
                require_key=False,
            )
            healthy = await client.health_check()
        elif status == GatewayStatus.STOPPED.value:
            status = "stopped"

        profile_path = (profile.profile_path or "").strip()
        if not profile_path or not Path(profile_path).exists():
            status = "not_deployed"
            healthy = False
        return ResolvedProfile(
            profile_id=profile.id,
            name=profile.name,
            display_name=profile.display_name,
            gateway_port=profile.gateway_port,
            base_url=base_url,
            status=status,
            healthy=healthy,
        )

    async def _resolve_profile(self, ref: str) -> Profile:
        ref = ref.strip()
        if not ref:
            raise profile_not_found()

        by_id = await self._repo.get_by_id(ref)
        if by_id is not None:
            return by_id

        by_name = await self._repo.get_by_name(ref)
        if by_name is not None:
            return by_name

        if ref == "default":
            default = await self._repo.get_by_name("default")
            if default is not None:
                return default
            typed = await self._repo.get_first_by_type("default")
            if typed is not None:
                return typed

        raise profile_not_found(ref=ref)

    async def require_profile(self, profile_id: str) -> Profile:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None:
            raise profile_not_found(profile_id=profile_id)
        return profile

    async def require_deployed_profile(self, profile_id: str) -> Profile:
        profile = await self.require_profile(profile_id)
        profile_path = (profile.profile_path or "").strip()
        if not profile_path or not Path(profile_path).exists():
            raise profile_not_deployed(profile_id=profile_id, name=profile.name)
        return profile
