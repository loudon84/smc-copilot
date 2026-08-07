from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings, get_settings
from core.constants import GatewayStatus
from core.errors import GatewayError
from db.models.profile import Profile
from integrations.hermes.client import HermesGatewayClient, extract_run_id
from integrations.hermes.client_factory import HermesGatewayClientFactory
from schemas.hermes import HermesRunCreate


class HermesGatewayService:
    def __init__(
        self,
        session: AsyncSession | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()

    async def _client(self, profile: Profile) -> HermesGatewayClient:
        if profile.status != GatewayStatus.RUNNING.value:
            raise GatewayError(f"Profile {profile.name} gateway is not running (status={profile.status})")
        if self._session is None:
            # Legacy fallthrough without session — no auth (tests / older callers)
            return HermesGatewayClient(profile.gateway_port)
        factory = HermesGatewayClientFactory(self._settings, self._session)
        return await factory.create_for_profile_name(
            profile.name,
            profile.gateway_port,
            require_key=False,
        )

    async def list_models(self, profile: Profile) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        return await (await self._client(profile)).list_models()

    async def create_run(self, profile: Profile, body: HermesRunCreate) -> tuple[str, dict[str, Any]]:
        data = await (await self._client(profile)).create_run(
            model=body.model,
            input_payload=body.input,
            metadata=body.metadata,
        )
        return extract_run_id(data), data

    async def get_run(self, profile: Profile, run_id: str) -> dict[str, Any]:
        return await (await self._client(profile)).get_run(run_id)

    async def list_run_events(self, profile: Profile, run_id: str) -> list[dict[str, Any]]:
        return await (await self._client(profile)).list_run_events(run_id)
