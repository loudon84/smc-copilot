from __future__ import annotations

import hashlib

from core.errors import ErrorCode, SaltControlError
from core.logging import safe_log_fields
from db.repositories.interfaces import RepositoryBundle, SecretScopeRecord
from integrations.secret_provider import SecretProvider
from schemas.secret import SecretResolveRequest, SecretResolveResponse, SecretValue
from services.idempotency_helper import get_cached_response, request_digest, store_response


class SecretService:
    def __init__(
        self,
        repos: RepositoryBundle,
        provider: SecretProvider,
    ) -> None:
        self.repos = repos
        self.provider = provider

    async def resolve(self, body: SecretResolveRequest) -> SecretResolveResponse:
        digest = request_digest(body)
        cached = await get_cached_response(self.repos, f"secret:{body.request_id}", digest)
        if cached is not None:
            return SecretResolveResponse.model_validate(cached)

        binding = await self.repos.bindings.get_active(body.endpoint_id)
        if binding is None or binding.user_id != body.user_id:
            # Fail closed — do not leak whether binding exists with different user
            raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)

        secrets: list[SecretValue] = []
        for ref in body.refs:
            allowed = await self.provider.check_acl(ref, body.endpoint_id, body.user_id)
            if not allowed:
                _ = safe_log_fields(ref=ref, endpoint_id=body.endpoint_id, error="secret_forbidden")
                raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)
            value = await self.provider.resolve(ref)
            if value is None:
                raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)
            # Persist scope metadata only — never store the value.
            checksum = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
            await self.repos.secret_scopes.upsert(
                SecretScopeRecord(
                    tenant_id=getattr(binding, "tenant_id", "default"),
                    endpoint_id=body.endpoint_id,
                    scope_type="user_ref",
                    scope_key=ref,
                    secret_ref=ref,
                    version="1",
                    checksum_redacted=checksum,
                )
            )
            secrets.append(SecretValue(ref=ref, value=value, status="ok"))

        response = SecretResolveResponse(secrets=secrets)
        await store_response(
            self.repos,
            f"secret:{body.request_id}",
            digest,
            response.model_dump(mode="json", by_alias=True),
        )
        return response

    async def upsert_scope(
        self,
        *,
        tenant_id: str,
        endpoint_id: str,
        scope_type: str,
        scope_key: str,
        secret_ref: str,
        version: str = "1",
        checksum_redacted: str | None = None,
    ) -> SecretScopeRecord:
        """Idempotent upsert — retry / rollback / remigrate must not create duplicates."""
        return await self.repos.secret_scopes.upsert(
            SecretScopeRecord(
                tenant_id=tenant_id,
                endpoint_id=endpoint_id,
                scope_type=scope_type,
                scope_key=scope_key,
                secret_ref=secret_ref,
                version=version,
                checksum_redacted=checksum_redacted,
            )
        )
