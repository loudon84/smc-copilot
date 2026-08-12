from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_MASTERS = {
    "salt-a.internal",
    "salt-b.internal",
    "salt.example.internal",
}
_PLACEHOLDER_FINGERPRINTS = {
    "sha256:master-a",
    "sha256:master-b",
    "sha256:placeholder",
}
_DEFAULT_LAB_SECRET = "lab-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://salt:salt@127.0.0.1:5432/salt_control"
    salt_env: str = Field(
        default="lab",
        validation_alias=AliasChoices("SMC_SALT_ENV", "salt_env"),
    )  # lab | test | production
    jwt_lab_secret: str = "lab-only-change-me"
    jwt_issuer: str = "smc-salt-control"
    jwt_audience: str = "salt-control"
    oidc_issuer: str = ""
    oidc_audience: str = "salt-control"
    oidc_jwks_url: str = ""
    salt_masters: str = "salt-a.internal,salt-b.internal"
    salt_master_fingerprints: str = "sha256:master-a,sha256:master-b"
    salt_api_urls: str = ""  # comma-separated https://...
    salt_api_username: str = ""
    salt_api_password: str = ""  # from secret store / env only — never log
    management_backend_url: str = ""
    artifact_store_url: str = ""
    secret_provider_url: str = ""
    artifact_public_key: str = ""
    artifact_key_id: str = ""
    enrollment_token_ttl_seconds: int = 3600
    device_credential_ttl_seconds: int = 86400 * 365
    desired_state_lkg_ttl_seconds: int = 3600

    @field_validator("salt_env")
    @classmethod
    def _normalize_env(cls, value: str) -> str:
        env = (value or "lab").strip().lower()
        if env not in {"lab", "test", "production"}:
            raise ValueError("SMC_SALT_ENV must be lab|test|production")
        return env

    @property
    def master_list(self) -> list[str]:
        return [m.strip() for m in self.salt_masters.split(",") if m.strip()]

    @property
    def master_fingerprint_list(self) -> list[str]:
        return [m.strip() for m in self.salt_master_fingerprints.split(",") if m.strip()]

    @property
    def salt_api_url_list(self) -> list[str]:
        return [m.strip() for m in self.salt_api_urls.split(",") if m.strip()]

    def assert_production_safe(self) -> None:
        """Fail closed when production settings are incomplete or use placeholders."""
        if self.salt_env != "production":
            return
        errors: list[str] = []
        if self.jwt_lab_secret == _DEFAULT_LAB_SECRET:
            errors.append("jwt_lab_secret must not be lab-only-change-me in production")
        if not self.oidc_issuer or not self.oidc_jwks_url:
            errors.append("oidc_issuer and oidc_jwks_url required in production")
        if not self.database_url.startswith("postgresql"):
            errors.append("production requires postgresql database_url")
        if not self.salt_api_url_list:
            errors.append("salt_api_urls required in production")
        for url in self.salt_api_url_list:
            if not url.startswith("https://"):
                errors.append(f"salt API must be https: {url}")
        for url_name, url in (
            ("management_backend_url", self.management_backend_url),
            ("artifact_store_url", self.artifact_store_url),
            ("secret_provider_url", self.secret_provider_url),
        ):
            if not url:
                errors.append(f"{url_name} required in production")
            elif not url.startswith("https://"):
                errors.append(f"{url_name} must be https")
        if any(m in _PLACEHOLDER_MASTERS for m in self.master_list):
            errors.append("placeholder salt masters forbidden in production")
        if any(f in _PLACEHOLDER_FINGERPRINTS for f in self.master_fingerprint_list):
            errors.append("placeholder master fingerprints forbidden in production")
        if not self.master_fingerprint_list or any(not f.startswith("sha256:") for f in self.master_fingerprint_list):
            errors.append("trusted master fingerprints required in production")
        if not self.artifact_key_id or not self.artifact_public_key:
            errors.append("artifact_key_id and artifact_public_key required in production")
        if not self.salt_api_username or not self.salt_api_password:
            errors.append("salt_api credentials required in production")
        if errors:
            raise ValueError("; ".join(errors))

    @model_validator(mode="after")
    def _reject_production_placeholders(self) -> Settings:
        if self.salt_env == "production":
            self.assert_production_safe()
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
