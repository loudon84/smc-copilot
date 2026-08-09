"""Read-only Hermes local configuration access (PRD v1.5.3).

Hermes owns ``~/.hermes/.env`` and ``~/.hermes/config.yaml``.
Runtime reads them; it does not maintain a competing credential SOT.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import dotenv_values

from core.config import Settings
from core.logging import get_logger
from runtime.hermes_profile_paths import (
    is_default_profile,
    profile_config_path,
    profile_env_path,
    profile_home,
)

logger = get_logger(__name__)

CREDENTIAL_SOURCE_HERMES_DOTENV = "hermes-dotenv"


@dataclass(frozen=True)
class HermesEnvSnapshot:
    """Parsed Hermes ``.env`` without exposing secrets in diagnostics."""

    path: Path
    exists: bool
    values: dict[str, str | None] = field(default_factory=dict)
    api_server_key_configured: bool = False


@dataclass(frozen=True)
class HermesConfigSnapshot:
    """Parsed Hermes ``config.yaml`` with lightweight validation."""

    path: Path
    exists: bool
    valid: bool
    error_code: str | None = None
    data: dict[str, Any] | None = None
    has_gateway_section: bool = False
    has_model_or_provider: bool = False


@dataclass(frozen=True)
class GatewayCredentialResolution:
    """Internal credential resolution — secret never enters API responses."""

    source: str
    configured: bool
    api_server_key: str | None
    key_fingerprint: str | None


@dataclass(frozen=True)
class HermesLocalConfigSnapshot:
    home: Path
    env_exists: bool
    config_exists: bool
    config_valid: bool
    api_server_key_configured: bool
    profile_name: str = "default"


@dataclass(frozen=True)
class HermesLocalConfigDiagnostics:
    """Redacted diagnostics payload for API responses."""

    profile: str
    hermes_home_display: str
    env_exists: bool
    api_server_key_configured: bool
    config_exists: bool
    config_valid: bool
    credential_source: str
    key_fingerprint: str | None
    legacy_runtime_secret_configured: bool = False
    legacy_runtime_secret_used: bool = False
    config_error_code: str | None = None


def fingerprint_api_server_key(key: str) -> str:
    """SHA-256 hex digest truncated to 10 chars for diagnostics only."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:10]


class HermesLocalConfigService:
    """Unique Runtime entry point for reading local Hermes configuration."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def resolve_home(self, profile_name: str | None = "default") -> Path:
        return profile_home(self._settings, profile_name or "default")

    def env_path(self, profile_name: str | None = "default") -> Path:
        return profile_env_path(self._settings, profile_name or "default")

    def config_path(self, profile_name: str | None = "default") -> Path:
        return profile_config_path(self._settings, profile_name or "default")

    def read_env(self, profile_name: str | None = "default") -> HermesEnvSnapshot:
        path = self.env_path(profile_name)
        if not path.is_file():
            return HermesEnvSnapshot(path=path, exists=False)
        try:
            raw = dotenv_values(path)
        except Exception as exc:
            logger.warning(
                "hermes.env.parse_failed",
                path=str(path),
                error=type(exc).__name__,
            )
            return HermesEnvSnapshot(path=path, exists=True)
        values: dict[str, str | None] = {}
        for key, value in (raw or {}).items():
            if key is None:
                continue
            values[str(key)] = None if value is None else str(value)
        key = (values.get("API_SERVER_KEY") or "").strip()
        return HermesEnvSnapshot(
            path=path,
            exists=True,
            values=values,
            api_server_key_configured=bool(key),
        )

    def read_config(self, profile_name: str | None = "default") -> HermesConfigSnapshot:
        path = self.config_path(profile_name)
        if not path.is_file():
            return HermesConfigSnapshot(
                path=path,
                exists=False,
                valid=False,
                error_code="HERMES_CONFIG_NOT_FOUND",
            )
        try:
            text = path.read_text(encoding="utf-8-sig")
            data = yaml.safe_load(text)
        except Exception:
            return HermesConfigSnapshot(
                path=path,
                exists=True,
                valid=False,
                error_code="HERMES_CONFIG_INVALID",
            )
        if data is None:
            data = {}
        if not isinstance(data, dict):
            return HermesConfigSnapshot(
                path=path,
                exists=True,
                valid=False,
                error_code="HERMES_CONFIG_INVALID",
            )
        has_gateway = isinstance(data.get("gateway"), (dict, type(None))) or "gateway" in data
        has_model = any(k in data for k in ("model", "models", "provider", "providers"))
        return HermesConfigSnapshot(
            path=path,
            exists=True,
            valid=True,
            data=data,
            has_gateway_section=bool(has_gateway),
            has_model_or_provider=bool(has_model),
        )

    def resolve_api_server_key(self, profile_name: str | None = "default") -> str | None:
        """Return API_SERVER_KEY from Hermes ``.env`` or None if missing."""
        name = (profile_name or "default").strip() or "default"
        if not is_default_profile(name):
            # Named profiles still resolve from their profile ``.env`` path when
            # policy allows; callers must enforce default-only for local Runtime.
            pass
        env = self.read_env(name)
        if not env.exists:
            return None
        key = (env.values.get("API_SERVER_KEY") or "").strip()
        return key or None

    def resolve_credential(self, profile_name: str | None = "default") -> GatewayCredentialResolution:
        key = self.resolve_api_server_key(profile_name)
        if not key:
            return GatewayCredentialResolution(
                source=CREDENTIAL_SOURCE_HERMES_DOTENV,
                configured=False,
                api_server_key=None,
                key_fingerprint=None,
            )
        return GatewayCredentialResolution(
            source=CREDENTIAL_SOURCE_HERMES_DOTENV,
            configured=True,
            api_server_key=key,
            key_fingerprint=fingerprint_api_server_key(key),
        )

    def snapshot(self, profile_name: str | None = "default") -> HermesLocalConfigSnapshot:
        name = (profile_name or "default").strip() or "default"
        env = self.read_env(name)
        config = self.read_config(name)
        return HermesLocalConfigSnapshot(
            home=self.resolve_home(name),
            env_exists=env.exists,
            config_exists=config.exists,
            config_valid=config.valid,
            api_server_key_configured=env.api_server_key_configured,
            profile_name=name if is_default_profile(name) else name,
        )

    def diagnose(
        self,
        profile_name: str | None = "default",
        *,
        legacy_runtime_secret_configured: bool = False,
    ) -> HermesLocalConfigDiagnostics:
        name = (profile_name or "default").strip() or "default"
        env = self.read_env(name)
        config = self.read_config(name)
        cred = self.resolve_credential(name)
        logger.info(
            "hermes.gateway.credential.resolved",
            source=cred.source,
            profile=name,
            configured=cred.configured,
            fingerprint=cred.key_fingerprint,
        )
        return HermesLocalConfigDiagnostics(
            profile=name if is_default_profile(name) else name,
            hermes_home_display="~/.hermes" if is_default_profile(name) else f"~/.hermes/profiles/{name}",
            env_exists=env.exists,
            api_server_key_configured=env.api_server_key_configured,
            config_exists=config.exists,
            config_valid=config.valid,
            credential_source=cred.source,
            key_fingerprint=cred.key_fingerprint,
            legacy_runtime_secret_configured=legacy_runtime_secret_configured,
            legacy_runtime_secret_used=False,
            config_error_code=config.error_code,
        )
