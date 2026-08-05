"""Internal Gateway Credential Broker — resolves API_SERVER_KEY for Hermes HTTP calls.

API_SERVER_KEY must never be returned to Desktop, written to logs, or embedded in
Chat SSE / exception detail payloads.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import HermesInstance, SecretReference
from runtime.hermes_profile_paths import is_default_profile
from services.secret_service import SecretStore


@dataclass(frozen=True)
class GatewayCredentials:
    """Resolved gateway endpoint credentials for internal Runtime use only."""

    instance_id: str | None
    profile_name: str
    gateway_port: int
    api_server_key: str


class GatewayCredentialService:
    """Resolves Gateway port + API_SERVER_KEY for authenticated Hermes calls."""

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        self._settings = settings
        self._session = session
        self._store = SecretStore(settings)

    async def resolve_api_server_key(self, profile_name: str) -> str | None:
        """Return API_SERVER_KEY for a profile scope, or None if unset."""
        name = (profile_name or "default").strip() or "default"
        scope_ids = {name, f"profile:{name}"}
        if is_default_profile(name):
            scope_ids.add("default")
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_id.in_(scope_ids),
                SecretReference.secret_name == "API_SERVER_KEY",
            )
        )
        for row in result.scalars().all():
            value = self._store.get(row.storage_key)
            if value and value.strip():
                return value.strip()
        return None

    async def resolve_for_instance(self, instance_id: str) -> GatewayCredentials:
        """Load HermesInstance + API_SERVER_KEY. Raises if instance or key missing."""
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        key = await self.resolve_api_server_key(inst.profile_name)
        if not key:
            raise RuntimeServiceError(
                "API_SERVER_KEY is required for Gateway API calls",
                code="secret_store_unavailable",
                details={"instanceId": instance_id, "profileName": inst.profile_name},
            )
        return GatewayCredentials(
            instance_id=inst.id,
            profile_name=inst.profile_name,
            gateway_port=inst.gateway_port,
            api_server_key=key,
        )

    async def resolve_for_profile_name(self, profile_name: str, gateway_port: int) -> GatewayCredentials:
        """Resolve key for a profile name + known port (legacy Profile adapter path)."""
        name = (profile_name or "default").strip() or "default"
        key = await self.resolve_api_server_key(name)
        if not key:
            raise RuntimeServiceError(
                "API_SERVER_KEY is required for Gateway API calls",
                code="secret_store_unavailable",
                details={"profileName": name},
            )
        return GatewayCredentials(
            instance_id=None,
            profile_name=name,
            gateway_port=gateway_port,
            api_server_key=key,
        )

    async def optional_key_for_profile(self, profile_name: str) -> str | None:
        """Best-effort key lookup for health probes — returns None when unset."""
        return await self.resolve_api_server_key(profile_name)
