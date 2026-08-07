from __future__ import annotations

from core.config import Settings
from core.constants import GatewayStatus
from core.errors import ConflictError, NotFoundError
from db.models.profile import Profile
from db.repositories.profile_repo import ProfileRepository
from integrations.hermes.config_writer import sync_profile_config
from runtime.port_allocator import allocate_port
from schemas.profile import ProfileCreate, ProfileUpdate
from utils.paths import profile_dir


class ProfileService:
    def __init__(self, settings: Settings, repo: ProfileRepository) -> None:
        self._settings = settings
        self._repo = repo

    async def list_profiles(self) -> list[Profile]:
        return await self._repo.list_all()

    async def get_profile(self, profile_id: str) -> Profile:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None:
            raise NotFoundError(f"Profile {profile_id} not found")
        return profile

    async def create_profile(self, body: ProfileCreate) -> Profile:
        existing = await self._repo.get_by_name(body.name)
        if existing is not None:
            raise ConflictError(f"Profile name '{body.name}' already exists")
        profiles = await self._repo.list_all()
        used_ports = {p.gateway_port for p in profiles}
        try:
            port = allocate_port(self._settings, body.gateway_port, used_ports)
        except ValueError as exc:
            raise ConflictError(str(exc)) from exc
        profile_path = str(profile_dir(self._settings, body.name))
        sync_profile_config(self._settings, body.name, port)
        profile = Profile(
            name=body.name,
            type=body.type.value,
            hermes_home=str(self._settings.hermes_home_path),
            profile_path=profile_path,
            gateway_port=port,
            enabled=body.enabled,
            auto_start=body.auto_start,
            status=GatewayStatus.STOPPED.value,
        )
        return await self._repo.create(profile)

    async def update_profile(self, profile_id: str, body: ProfileUpdate) -> Profile:
        profile = await self.get_profile(profile_id)
        if body.name is not None and body.name != profile.name:
            conflict = await self._repo.get_by_name(body.name)
            if conflict is not None:
                raise ConflictError(f"Profile name '{body.name}' already exists")
            profile.name = body.name
        if body.type is not None:
            profile.type = body.type.value
        if body.gateway_port is not None and body.gateway_port != profile.gateway_port:
            profiles = await self._repo.list_all()
            used_ports = {p.gateway_port for p in profiles if p.id != profile_id}
            try:
                port = allocate_port(self._settings, body.gateway_port, used_ports)
            except ValueError as exc:
                raise ConflictError(str(exc)) from exc
            profile.gateway_port = port
            sync_profile_config(self._settings, profile.name, profile.gateway_port)
        if body.enabled is not None:
            profile.enabled = body.enabled
        if body.auto_start is not None:
            profile.auto_start = body.auto_start
        return await self._repo.update(profile)

    async def delete_profile(self, profile_id: str) -> None:
        profile = await self.get_profile(profile_id)
        await self._repo.delete(profile)

    async def set_status(self, profile: Profile, status: GatewayStatus, *, pid: int | None = None) -> Profile:
        profile.status = status.value
        if pid is not None:
            profile.gateway_pid = pid
        elif status in (GatewayStatus.STOPPED, GatewayStatus.ERROR):
            profile.gateway_pid = None
        return await self._repo.update(profile)
