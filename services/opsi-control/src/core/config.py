from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_LAB_SECRET = "lab-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://opsi:opsi@127.0.0.1:5432/opsi_control"
    opsi_env: str = Field(default="lab", validation_alias=AliasChoices("SMC_OPSI_ENV", "opsi_env"))
    jwt_lab_secret: str = "lab-only-change-me"
    jwt_issuer: str = "smc-opsi-control"
    jwt_audience: str = "opsi-control"
    oidc_issuer: str = ""
    oidc_audience: str = "opsi-control"
    oidc_jwks_url: str = ""
    opsi_rpc_url: str = ""
    opsi_rpc_username: str = ""
    opsi_rpc_password: str = ""
    opsi_rpc_password_ref: str = ""
    opsi_rpc_timeout_seconds: float = 15.0
    opsi_rpc_max_bytes: int = 1_048_576
    secret_provider_url: str = ""
    secret_provider_token_ref: str = ""
    product_id: str = "smc-hermes-agent"
    start_workers: bool = True
    worker_mode: str = "lifespan"

    @field_validator("opsi_env")
    @classmethod
    def _normalize_env(cls, value: str) -> str:
        env = (value or "lab").strip().lower()
        if env not in {"lab", "test", "production"}:
            raise ValueError("SMC_OPSI_ENV must be lab|test|production")
        return env

    @field_validator("worker_mode")
    @classmethod
    def _worker_mode(cls, value: str) -> str:
        mode = (value or "lifespan").strip().lower()
        if mode not in {"lifespan", "standalone"}:
            raise ValueError("worker_mode must be lifespan|standalone")
        return mode

    def assert_production_safe(self) -> None:
        if self.opsi_env != "production":
            return
        errors: list[str] = []
        if self.jwt_lab_secret == _DEFAULT_LAB_SECRET or not self.jwt_lab_secret:
            errors.append("jwt_lab_secret must not be lab-only-change-me in production")
        if not self.oidc_issuer or not self.oidc_jwks_url:
            errors.append("oidc_issuer and oidc_jwks_url required in production")
        if not self.opsi_rpc_url.startswith("https://"):
            errors.append("opsi_rpc_url must be https in production")
        if self.opsi_rpc_password:
            errors.append("opsi_rpc_password must not be stored in settings; use opsi_rpc_password_ref")
        if not self.opsi_rpc_username or not self.opsi_rpc_password_ref:
            errors.append("opsi RPC username and password secret reference required in production")
        if not self.secret_provider_url.startswith("https://"):
            errors.append("secret_provider_url must be https in production")
        if self.database_url.startswith("sqlite"):
            errors.append("sqlite is not allowed in production")
        if errors:
            raise ValueError("; ".join(errors))

    @model_validator(mode="after")
    def _production_guard(self) -> Settings:
        self.assert_production_safe()
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
