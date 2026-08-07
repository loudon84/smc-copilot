from __future__ import annotations

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.config import Settings
from core.logging import get_logger
from core.runtime_enums import BootstrapSessionStatus, InstanceStatus, RuntimeJobType
from core.runtime_errors import RuntimeServiceError
from db.models.runtime import BootstrapSession, HermesInstance, RuntimeJob
from db.repositories.bootstrap_repo import BootstrapSessionRepository
from db.repositories.runtime_repo import RuntimeJobRepository
from runtime.cancellation_token import CancellationToken
from schemas.bootstrap import BootstrapConfigRequest, BootstrapJobResponse
from services.runtime_job_service import job_to_response

logger = get_logger(__name__)

_FORBIDDEN_KEY_RE = re.compile(
    r"(^|_)(api[_-]?key|provider[_-]?api[_-]?key|openai|anthropic|gemini|azure[_-]?openai|secret[_-]?key)s?$",
    re.IGNORECASE,
)
_ALLOWED_MANIFEST_KEYS = frozenset({"runtimeManifestUrl", "hermesManifestUrl"})


def hash_bootstrap_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def find_forbidden_provider_keys(obj: Any, path: str = "") -> list[str]:
    """Reject bootstrap JSON that attempts to carry Provider API keys."""
    violations: list[str] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            current = f"{path}.{key}" if path else key
            if key not in _ALLOWED_MANIFEST_KEYS and _FORBIDDEN_KEY_RE.search(key.replace("-", "_")):
                violations.append(current)
            violations.extend(find_forbidden_provider_keys(value, current))
    elif isinstance(obj, list):
        for index, item in enumerate(obj):
            violations.extend(find_forbidden_provider_keys(item, f"{path}[{index}]"))
    return violations


# @lat: [[auth-pairing#Bootstrap 一次性令牌]]
class BootstrapService:
    DEFAULT_TTL_SECONDS = 3600

    def __init__(
        self,
        settings: Settings,
        session: AsyncSession | None = None,
        *,
        session_maker: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        self._settings = settings
        self._session = session
        self._session_maker = session_maker

    @staticmethod
    def generate_token() -> str:
        return secrets.token_urlsafe(48)

    def _repo(self) -> BootstrapSessionRepository:
        if self._session is None:
            raise RuntimeError("BootstrapService requires a database session")
        return BootstrapSessionRepository(self._session)

    def _jobs(self) -> RuntimeJobRepository:
        if self._session is None:
            raise RuntimeError("BootstrapService requires a database session")
        return RuntimeJobRepository(self._session)

    async def register_token(self, token: str, *, ttl_seconds: int | None = None) -> BootstrapSession:
        ttl = ttl_seconds if ttl_seconds is not None else self.DEFAULT_TTL_SECONDS
        await self._repo().invalidate_all_active()
        row = BootstrapSession(
            token_hash=hash_bootstrap_token(token),
            status=BootstrapSessionStatus.PENDING.value,
            expires_at=datetime.now(UTC) + timedelta(seconds=ttl),
        )
        await self._repo().add(row)
        return row

    async def authenticate_token(self, token: str) -> BootstrapSession | None:
        row = await self._repo().get_by_token_hash(hash_bootstrap_token(token))
        if row is None:
            return None
        now = datetime.now(UTC)
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if row.status in (
            BootstrapSessionStatus.COMPLETED.value,
            BootstrapSessionStatus.INVALIDATED.value,
            BootstrapSessionStatus.EXPIRED.value,
        ):
            return None
        if now > expires:
            await self._repo().mark_expired(row)
            return None
        if row.status == BootstrapSessionStatus.PENDING.value:
            row.status = BootstrapSessionStatus.ACTIVE.value
            await self._session.flush()  # type: ignore[union-attr]
        return row

    def validate_config(self, config: BootstrapConfigRequest) -> None:
        raw = config.model_dump(by_alias=True)
        violations = find_forbidden_provider_keys(raw)
        if violations:
            raise RuntimeServiceError(
                "Bootstrap config must not contain Provider API keys",
                code="bootstrap_forbidden_secret",
                details={"fields": violations},
            )

    async def assert_bootstrap_session_active(self, session_id: str) -> None:
        session_row = await self._repo().get(session_id)
        if session_row is None:
            raise RuntimeServiceError("Bootstrap session not found", code="unauthorized")
        if session_row.status not in (
            BootstrapSessionStatus.PENDING.value,
            BootstrapSessionStatus.ACTIVE.value,
        ):
            raise RuntimeServiceError("Bootstrap token already used", code="unauthorized")

    async def get_job(self, job_id: str) -> BootstrapJobResponse:
        job = await self._jobs().get(job_id)
        if job is None or job.job_type != RuntimeJobType.BOOTSTRAP.value:
            raise RuntimeServiceError("Bootstrap job not found", code="not_found")
        response = job_to_response(job)
        return BootstrapJobResponse(
            jobId=response.job_id,
            jobType=response.job_type,
            status=response.status,
            phase=response.phase,
            progress=response.progress,
            errorCode=response.error_code,
            errorMessage=response.error_message,
            result=response.result,
            createdAt=response.created_at,
            startedAt=response.started_at,
            completedAt=response.completed_at,
        )

    async def run_job(
        self,
        job: RuntimeJob,
        request: dict[str, Any],
        progress,
        cancellation_token: CancellationToken | None = None,
    ) -> dict[str, Any]:
        if self._session_maker is None:
            raise RuntimeError("Bootstrap job handler requires session_maker")

        token = cancellation_token or CancellationToken()
        config_data = request.get("config") or {}
        bootstrap_session_id = request.get("bootstrapSessionId")
        config = BootstrapConfigRequest.model_validate(config_data)
        self.validate_config(config)

        original_manifest = self._settings.hermes_manifest_url
        try:
            self._settings.hermes_manifest_url = config.hermes_manifest_url
            from services.installation_service import InstallationService

            install_request: dict[str, Any] = {
                "version": "latest",
                "channel": config.runtime_channel,
                "createDefaultInstance": False,
            }
            if config.runtime_manifest_url:
                install_request["runtimeManifestUrl"] = config.runtime_manifest_url

            installer = InstallationService(self._settings, self._session_maker)
            token.raise_if_cancelled()
            await progress("Installing Hermes runtime", phase="install", progress_value=0.2)
            install_result = await installer.run_job(job, install_request, progress, token)

            token.raise_if_cancelled()
            await progress("Applying default instance", phase="instance", progress_value=0.85)
            async with self._session_maker() as session:
                instance_id = await self._ensure_instance(session, config)
                if bootstrap_session_id:
                    session_row = await BootstrapSessionRepository(session).get(str(bootstrap_session_id))
                    if session_row is not None:
                        await BootstrapSessionRepository(session).mark_completed(session_row)
                await session.commit()

            await progress("Bootstrap complete", phase="completed", progress_value=1.0)
            return {
                "tenantId": config.tenant_id,
                "requireAuth": config.require_auth,
                "allowLegacyToken": config.allow_legacy_token,
                "instanceId": instance_id,
                "install": install_result,
            }
        finally:
            self._settings.hermes_manifest_url = original_manifest

    async def _ensure_instance(self, session: AsyncSession, config: BootstrapConfigRequest) -> str:
        inst_cfg = config.default_instance
        result = await session.execute(select(HermesInstance).where(HermesInstance.name == inst_cfg.name))
        existing = result.scalar_one_or_none()
        if existing:
            existing.gateway_port = inst_cfg.gateway_port
            existing.auto_start = inst_cfg.auto_start
            await session.flush()
            return existing.id
        row = HermesInstance(
            name=inst_cfg.name,
            profile_name=inst_cfg.name,
            gateway_port=inst_cfg.gateway_port,
            status=InstanceStatus.CREATED.value,
            healthy=False,
            auto_start=inst_cfg.auto_start,
        )
        session.add(row)
        await session.flush()
        return row.id
