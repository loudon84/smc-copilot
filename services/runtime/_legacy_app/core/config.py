from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    postgres_dsn: str | None = Field(default=None, alias="POSTGRES_DSN")

    document_snapshot_bucket: str = Field(default="aios-documents", alias="DOCUMENT_SNAPSHOT_BUCKET")
    document_snapshot_max_bytes: int = Field(default=20 * 1024 * 1024, alias="DOCUMENT_SNAPSHOT_MAX_BYTES")

    s3_endpoint_url: str = Field(alias="S3_ENDPOINT_URL")
    s3_access_key: str = Field(alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(alias="S3_SECRET_KEY")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    s3_force_path_style: bool = Field(default=True, alias="S3_FORCE_PATH_STYLE")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def require_postgres_dsn(settings: Settings) -> str:
    if not settings.postgres_dsn:
        raise ValueError("POSTGRES_DSN is required")
    return settings.postgres_dsn
