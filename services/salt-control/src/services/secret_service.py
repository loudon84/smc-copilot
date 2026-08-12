from __future__ import annotations

from core.errors import ErrorCode, SaltControlError
from core.idempotency import IdempotencyStore
from core.logging import safe_log_fields
from db.repositories.interfaces import RepositoryBundle
from integrations.secret_provider import SecretProvider
from schemas.secret import SecretResolveRequest, SecretResolveResponse, SecretValue


class SecretService:
    def __init__(
        self,
        repos: RepositoryBundle,
        provider: SecretProvider,
        idempotency: IdempotencyStore,
    ) -> None:
        self.repos = repos
        self.provider = provider
        self.idempotency = idempotency

    async def resolve(self, body: SecretResolveRequest) -> SecretResolveResponse:
        cached = self.idempotency.get(f"secret:{body.request_id}")
        if cached is not None:
            return cached

        binding = await self.repos.bindings.get_active(body.endpoint_id)
        if binding is None or binding.user_id != body.user_id:
            # Fail closed — do not leak whether binding exists with different user
            raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)

        secrets: list[SecretValue] = []
        for ref in body.refs:
            allowed = await self.provider.check_acl(ref, body.endpoint_id, body.user_id)
            if not allowed:
                # Log without value
                _ = safe_log_fields(ref=ref, endpoint_id=body.endpoint_id, error="secret_forbidden")
                raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)
            value = await self.provider.resolve(ref)
            if value is None:
                raise SaltControlError(ErrorCode.SECRET_FORBIDDEN, "secret access denied", status_code=403)
            secrets.append(SecretValue(ref=ref, value=value, status="ok"))

        response = SecretResolveResponse(secrets=secrets)
        self.idempotency.put(f"secret:{body.request_id}", response)
        return response
