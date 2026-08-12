from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, Request

from core.config import Settings, get_settings
from core.errors import ErrorCode, SaltControlError

try:
    import jwt
    from jwt import PyJWKClient
except ImportError:  # pragma: no cover - optional until uv sync
    jwt = None  # type: ignore[assignment]
    PyJWKClient = None  # type: ignore[misc, assignment]


class Scope(StrEnum):
    DESIRED_STATE_READ = "salt.desired_state.read"
    RETURN_WRITE = "salt.return.write"
    ARTIFACT_READ = "salt.artifact.read"
    ROLLOUT_ADMIN = "salt.rollout.admin"
    MASTER = "salt.master"


@dataclass(frozen=True)
class AuthPrincipal:
    subject: str
    principal_type: str  # device | service | operator
    scopes: frozenset[str]
    endpoint_id: str | None = None


_jwks_clients: dict[str, Any] = {}


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def mint_lab_jwt(
    *,
    subject: str,
    scopes: list[str],
    settings: Settings | None = None,
    ttl_seconds: int = 300,
    extra: dict | None = None,
) -> str:
    """HS256 JWT stub for lab/test Client Credentials and operator tokens."""
    cfg = settings or get_settings()
    if cfg.salt_env == "production":
        raise SaltControlError(
            ErrorCode.FORBIDDEN,
            "lab JWT minting forbidden in production",
            status_code=403,
        )
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": cfg.jwt_issuer,
        "aud": cfg.jwt_audience,
        "sub": subject,
        "scope": " ".join(scopes),
        "iat": now,
        "nbf": now,
        "exp": now + ttl_seconds,
    }
    if extra:
        payload.update(extra)
    segments = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}."
    segments += _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(cfg.jwt_lab_secret.encode("utf-8"), segments.encode("ascii"), hashlib.sha256).digest()
    return f"{segments}.{_b64url(sig)}"


def verify_lab_jwt(token: str, settings: Settings) -> dict:
    if settings.salt_env == "production":
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "lab JWT forbidden in production", status_code=401)
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
    except ValueError as exc:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid token", status_code=401) from exc
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected = hmac.new(settings.jwt_lab_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64url_decode(sig_b64)):
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid token signature", status_code=401)
    try:
        payload = json.loads(_b64url_decode(payload_b64))
        header = json.loads(_b64url_decode(header_b64))
    except (json.JSONDecodeError, ValueError) as exc:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid token payload", status_code=401) from exc
    if header.get("alg") != "HS256":
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid token alg", status_code=401)
    if payload.get("iss") != settings.jwt_issuer or payload.get("aud") != settings.jwt_audience:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid token audience", status_code=401)
    now = int(time.time())
    if int(payload.get("nbf", 0)) > now:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "token not yet valid", status_code=401)
    if int(payload.get("exp", 0)) < now:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "token expired", status_code=401)
    return payload


def _jwks_client(jwks_url: str) -> Any:
    if jwt is None or PyJWKClient is None:
        raise SaltControlError(ErrorCode.INTERNAL_ERROR, "PyJWT required for OIDC", status_code=500)
    client = _jwks_clients.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url, cache_keys=True, lifespan=300)
        _jwks_clients[jwks_url] = client
    return client


def verify_oidc_jwt(token: str, settings: Settings) -> dict:
    if jwt is None:
        raise SaltControlError(ErrorCode.INTERNAL_ERROR, "PyJWT required for OIDC", status_code=500)
    if not settings.oidc_issuer or not settings.oidc_jwks_url:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "OIDC not configured", status_code=401)
    try:
        signing_key = _jwks_client(settings.oidc_jwks_url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.oidc_audience or settings.jwt_audience,
            issuer=settings.oidc_issuer,
            options={"require": ["exp", "iat", "nbf", "iss", "aud", "sub"]},
        )
    except Exception as exc:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "invalid OIDC token", status_code=401) from exc
    header = jwt.get_unverified_header(token)
    if not header.get("kid"):
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "token kid required", status_code=401)
    if "scope" not in payload and "scp" not in payload:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "token scope required", status_code=401)
    return payload


def verify_bearer_token(token: str, settings: Settings) -> dict:
    if settings.salt_env in {"lab", "test"}:
        # Prefer lab HS256 in non-production for local tests; fall back to OIDC if configured.
        try:
            return verify_lab_jwt(token, settings)
        except SaltControlError:
            if settings.oidc_jwks_url:
                return verify_oidc_jwt(token, settings)
            raise
    return verify_oidc_jwt(token, settings)


def scopes_from_payload(payload: dict) -> frozenset[str]:
    raw = payload.get("scope") or payload.get("scp") or ""
    if isinstance(raw, list):
        return frozenset(str(s) for s in raw)
    return frozenset(str(raw).split())


async def get_authorization_header(authorization: Annotated[str | None, Header()] = None) -> str | None:
    return authorization


def parse_device_credential(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Device "):
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "device credential required", status_code=401)
    cred = authorization.removeprefix("Device ").strip()
    if not cred:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "device credential required", status_code=401)
    return cred


def parse_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "bearer token required", status_code=401)
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "bearer token required", status_code=401)
    return token


async def require_device(request: Request, authorization: Annotated[str | None, Header()] = None) -> AuthPrincipal:
    cred = parse_device_credential(authorization)
    repos = request.app.state.repos
    endpoint = await repos.endpoints.get_by_credential_hash(hash_secret(cred))
    if endpoint is None:
        raise SaltControlError(ErrorCode.UNAUTHORIZED, "unknown device credential", status_code=401)
    return AuthPrincipal(
        subject=endpoint.id,
        principal_type="device",
        scopes=frozenset({Scope.RETURN_WRITE, Scope.ARTIFACT_READ}),
        endpoint_id=endpoint.id,
    )


def scoped_auth(*required: str):
    async def _dep(request: Request, authorization: Annotated[str | None, Header()] = None) -> AuthPrincipal:
        token = parse_bearer_token(authorization)
        payload = verify_bearer_token(token, request.app.state.settings)
        scopes = scopes_from_payload(payload)
        if not any(s in scopes for s in required):
            raise SaltControlError(ErrorCode.FORBIDDEN, "insufficient scope", status_code=403)
        return AuthPrincipal(
            subject=str(payload.get("sub", "")),
            principal_type="operator" if Scope.ROLLOUT_ADMIN in scopes else "service",
            scopes=scopes,
            endpoint_id=payload.get("endpoint_id"),
        )

    return _dep


async def probe_oidc_jwks(settings: Settings, *, timeout: float = 3.0) -> bool:
    if settings.salt_env != "production":
        return True
    if not settings.oidc_jwks_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(settings.oidc_jwks_url)
            return resp.status_code == 200 and "keys" in resp.json()
    except Exception:
        return False


DeviceAuth = Annotated[AuthPrincipal, Depends(require_device)]
MasterAuth = Annotated[AuthPrincipal, Depends(scoped_auth(Scope.DESIRED_STATE_READ, Scope.MASTER))]
OperatorAuth = Annotated[AuthPrincipal, Depends(scoped_auth(Scope.ROLLOUT_ADMIN))]
ArtifactAuth = Annotated[
    AuthPrincipal,
    Depends(scoped_auth(Scope.ARTIFACT_READ, Scope.MASTER, Scope.DESIRED_STATE_READ)),
]
