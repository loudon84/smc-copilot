from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Any

from fastapi import Depends, Header, Request

from core.config import Settings, get_settings
from core.errors import ErrorCode, OpsiControlError

try:
    import jwt
    from jwt import PyJWKClient
except ImportError:  # pragma: no cover
    jwt = None  # type: ignore[assignment]
    PyJWKClient = None  # type: ignore[misc, assignment]


class Scope(StrEnum):
    INVENTORY_READ = "opsi.inventory.read"
    ACTION_DISPATCH = "opsi.action.dispatch"
    POLICY_APPLY = "opsi.policy.apply"
    DIAGNOSTICS_READ = "opsi.diagnostics.read"


@dataclass(frozen=True)
class AuthPrincipal:
    subject: str
    principal_type: str
    scopes: frozenset[str]


def mint_lab_jwt(
    *,
    subject: str,
    scopes: list[str],
    settings: Settings | None = None,
    ttl_seconds: int = 300,
) -> str:
    cfg = settings or get_settings()
    if cfg.opsi_env == "production":
        raise OpsiControlError(ErrorCode.FORBIDDEN, "lab JWT forbidden in production", status_code=403)
    if jwt is None:
        raise RuntimeError("PyJWT required")
    now = int(time.time())
    payload = {
        "iss": cfg.jwt_issuer,
        "aud": cfg.jwt_audience,
        "sub": subject,
        "iat": now,
        "exp": now + ttl_seconds,
        "scope": " ".join(scopes),
    }
    return jwt.encode(payload, cfg.jwt_lab_secret, algorithm="HS256")


def _scopes_from_payload(payload: dict[str, Any]) -> frozenset[str]:
    raw = payload.get("scope") or payload.get("scopes") or ""
    if isinstance(raw, list):
        return frozenset(str(item) for item in raw)
    return frozenset(part for part in str(raw).replace(",", " ").split() if part)


async def get_principal(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthPrincipal:
    settings: Settings = request.app.state.settings
    if not authorization or not authorization.lower().startswith("bearer "):
        raise OpsiControlError(ErrorCode.UNAUTHORIZED, "missing bearer token", status_code=401)
    token = authorization.split(" ", 1)[1].strip()
    if jwt is None:
        raise OpsiControlError(ErrorCode.INTERNAL_ERROR, "jwt library missing", status_code=500)
    try:
        if settings.opsi_env == "production":
            if not settings.oidc_jwks_url or PyJWKClient is None:
                raise OpsiControlError(ErrorCode.UNAUTHORIZED, "oidc jwks unavailable", status_code=401)
            client = PyJWKClient(settings.oidc_jwks_url)
            signing_key = client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=settings.oidc_audience,
                issuer=settings.oidc_issuer,
            )
        else:
            payload = jwt.decode(
                token,
                settings.jwt_lab_secret,
                algorithms=["HS256"],
                audience=settings.jwt_audience,
                issuer=settings.jwt_issuer,
            )
    except OpsiControlError:
        raise
    except Exception as exc:
        raise OpsiControlError(ErrorCode.UNAUTHORIZED, "invalid token", status_code=401) from exc
    return AuthPrincipal(
        subject=str(payload.get("sub") or "unknown"), principal_type="operator", scopes=_scopes_from_payload(payload)
    )


def require_scope(*needed: Scope):
    async def _inner(principal: Annotated[AuthPrincipal, Depends(get_principal)]) -> AuthPrincipal:
        missing = [scope.value for scope in needed if scope.value not in principal.scopes]
        if missing:
            raise OpsiControlError(
                ErrorCode.FORBIDDEN, "insufficient scope", status_code=403, details={"missing": missing}
            )
        return principal

    return _inner


def digest_payload(payload: dict[str, Any]) -> str:
    import json

    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
