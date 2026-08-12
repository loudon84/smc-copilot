from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://salt:salt@127.0.0.1:5432/salt_control"
    salt_env: str = "lab"  # lab | test | production
    jwt_lab_secret: str = "lab-only-change-me"
    jwt_issuer: str = "smc-salt-control"
    jwt_audience: str = "salt-control"
    salt_masters: str = "salt-a.internal,salt-b.internal"
    salt_master_fingerprints: str = "sha256:master-a,sha256:master-b"
    enrollment_token_ttl_seconds: int = 3600
    device_credential_ttl_seconds: int = 86400 * 365

    @property
    def master_list(self) -> list[str]:
        return [m.strip() for m in self.salt_masters.split(",") if m.strip()]

    @property
    def master_fingerprint_list(self) -> list[str]:
        return [m.strip() for m in self.salt_master_fingerprints.split(",") if m.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
