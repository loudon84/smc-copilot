"""Internal Gateway Credential Broker — resolves API_SERVER_KEY for Hermes HTTP calls.

PRD v1.5.3: Local Hermes API_SERVER_KEY comes from ``~/.hermes/.env`` via
``HermesLocalConfigService``. Runtime SecretStore is not the credential SOT.

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
from runtime.local_hermes_profile_policy import require_supported_local_profile
from services.hermes_local_config_service import HermesLocalConfigService
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
        self._local_config = HermesLocalConfigService(settings)
        self._store = SecretStore(settings)

    async def resolve_api_server_key(self, profile_name: str) -> str | None:
        """Return API_SERVER_KEY from Hermes ``.env`` (never Runtime SecretStore)."""
        name = require_supported_local_profile(profile_name)
        return self._local_config.resolve_api_server_key(name)

    async def has_legacy_runtime_api_server_key(self, profile_name: str) -> bool:
        """Detect residual Runtime SecretStore key without using it."""
        name = (profile_name or "default").strip() or "default"
        scope_ids = {name, f"profile:{name}", "default"}
        result = await self._session.execute(
            select(SecretReference).where(
                SecretReference.scope_id.in_(scope_ids),
                SecretReference.secret_name == "API_SERVER_KEY",
            )
        )
        for row in result.scalars().all():
            value = self._store.get(row.storage_key)
            if value and value.strip():
                return True
        return False

    async def resolve_for_instance(self, instance_id: str) -> GatewayCredentials:
        """Load HermesInstance + API_SERVER_KEY. Raises if instance or key missing."""
        inst = await self._session.get(HermesInstance, instance_id)
        if inst is None:
            raise RuntimeServiceError(f"Instance not found: {instance_id}", code="not_found")
        name = require_supported_local_profile(inst.profile_name)
        key = await self.resolve_api_server_key(name)
        if not key:
            raise RuntimeServiceError(
                "Hermes API Server key is not configured in ~/.hermes/.env",
                code="HERMES_API_SERVER_KEY_MISSING",
                details={"instanceId": instance_id, "profileName": name},
            )
        return GatewayCredentials(
            instance_id=inst.id,
            profile_name=name,
            gateway_port=inst.gateway_port,
            api_server_key=key,
        )

    async def resolve_for_profile_name(self, profile_name: str, gateway_port: int) -> GatewayCredentials:
        """Resolve key for a profile name + known port (legacy Profile adapter path)."""
        name = require_supported_local_profile(profile_name)
        key = await self.resolve_api_server_key(name)
        if not key:
            raise RuntimeServiceError(
                "Hermes API Server key is not configured in ~/.hermes/.env",
                code="HERMES_API_SERVER_KEY_MISSING",
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
        try:
            return await self.resolve_api_server_key(profile_name)
        except RuntimeServiceError as exc:
            if exc.code == "LOCAL_HERMES_PROFILE_UNSUPPORTED":
                return None
            raise
