"""Factory for authenticated HermesGatewayClient instances.

Business code must not construct HermesGatewayClient(port) directly — use this
factory so Authorization: Bearer <API_SERVER_KEY> is always attached.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance
from integrations.hermes.client import HermesGatewayClient
from services.gateway_credential_service import GatewayCredentialService


class HermesGatewayClientFactory:
    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._credentials = GatewayCredentialService(settings, session)

    async def create_for_instance(
        self,
        instance_id: str,
        *,
        timeout: float = 60.0,
        require_key: bool = True,
    ) -> HermesGatewayClient:
        if require_key:
            creds = await self._credentials.resolve_for_instance(instance_id)
            return HermesGatewayClient(
                creds.gateway_port,
                timeout=timeout,
                api_key=creds.api_server_key,
            )
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        key = await self._credentials.optional_key_for_profile(inst.profile_name)
        return HermesGatewayClient(inst.gateway_port, timeout=timeout, api_key=key)

    async def create_for_profile_name(
        self,
        profile_name: str,
        gateway_port: int,
        *,
        timeout: float = 60.0,
        require_key: bool = True,
    ) -> HermesGatewayClient:
        if require_key:
            creds = await self._credentials.resolve_for_profile_name(profile_name, gateway_port)
            return HermesGatewayClient(
                creds.gateway_port,
                timeout=timeout,
                api_key=creds.api_server_key,
            )
        key = await self._credentials.optional_key_for_profile(profile_name)
        return HermesGatewayClient(gateway_port, timeout=timeout, api_key=key)

    async def create_for_profile_port(
        self,
        gateway_port: int,
        *,
        profile_name: str | None = None,
        timeout: float = 60.0,
        require_key: bool = False,
    ) -> HermesGatewayClient:
        """Create client for a known port, optionally resolving key via profile_name or Instance lookup."""
        name = profile_name
        if not name:
            result = await self._session.execute(
                select(HermesInstance).where(HermesInstance.gateway_port == gateway_port).limit(1)
            )
            inst = result.scalar_one_or_none()
            if inst is not None:
                name = inst.profile_name
        key: str | None = None
        if name:
            key = await self._credentials.optional_key_for_profile(name)
            if require_key and not key:
                raise RuntimeServiceError(
                    "API_SERVER_KEY is required for Gateway API calls",
                    code="secret_store_unavailable",
                    details={"profileName": name, "gatewayPort": gateway_port},
                )
        return HermesGatewayClient(gateway_port, timeout=timeout, api_key=key)
