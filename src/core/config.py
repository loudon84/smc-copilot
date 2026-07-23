from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from runtime.platform_paths import default_runtime_data_dir


def _resolve_project_root() -> Path:
    """copilot-serve 仓库根目录（含 pyproject.toml）。"""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "pyproject.toml").is_file():
            return parent
    # src/core/config.py -> copilot-serve
    return here.parents[2]


_PACKAGE_ROOT = _resolve_project_root()

# 与 smc-copilot-desktop 用户数据目录一致；可通过 SQLITE_PATH 覆盖
_DEFAULT_SQLITE_PATH = "~/.hermes/desktop/sqlite.db"


def _abs_path(value: str) -> str:
    if not value or not str(value).strip():
        return value
    return str(Path(value).expanduser().resolve())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PACKAGE_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- legacy / service bind (kept for compatibility) ---
    copilot_host: str = Field(default="127.0.0.1", alias="COPILOT_HOST")
    copilot_port: int = Field(default=8765, alias="COPILOT_PORT")
    sqlite_path: str = Field(default=_DEFAULT_SQLITE_PATH, alias="SQLITE_PATH")
    hermes_home: str = Field(default="~/.hermes", alias="HERMES_HOME")
    default_gateway_port: int = Field(default=8642, alias="DEFAULT_GATEWAY_PORT")
    hermes_gateway_command: str = Field(default="hermes gateway", alias="HERMES_GATEWAY_COMMAND")
    log_dir: str = Field(default="./data/logs", alias="LOG_DIR")
    gateway_health_timeout_sec: float = Field(default=30.0, alias="GATEWAY_HEALTH_TIMEOUT_SEC")
    gateway_health_poll_interval_sec: float = Field(default=0.5, alias="GATEWAY_HEALTH_POLL_INTERVAL_SEC")

    # --- Runtime Service (PRD §13) ---
    runtime_host: str = Field(default="127.0.0.1", alias="RUNTIME_HOST")
    runtime_port: int = Field(default=8765, alias="RUNTIME_PORT")
    runtime_data_dir: str = Field(default="", alias="RUNTIME_DATA_DIR")
    runtime_log_dir: str = Field(default="", alias="RUNTIME_LOG_DIR")
    runtime_download_dir: str = Field(default="", alias="RUNTIME_DOWNLOAD_DIR")
    runtime_staging_dir: str = Field(default="", alias="RUNTIME_STAGING_DIR")
    runtime_backup_dir: str = Field(default="", alias="RUNTIME_BACKUP_DIR")

    hermes_runtime_channel: str = Field(default="stable", alias="HERMES_RUNTIME_CHANNEL")
    hermes_manifest_url: str = Field(default="", alias="HERMES_MANIFEST_URL")
    hermes_install_timeout_seconds: int = Field(default=900, alias="HERMES_INSTALL_TIMEOUT_SECONDS")
    hermes_doctor_timeout_seconds: int = Field(default=300, alias="HERMES_DOCTOR_TIMEOUT_SECONDS")
    hermes_gateway_start_timeout_seconds: int = Field(default=60, alias="HERMES_GATEWAY_START_TIMEOUT_SECONDS")
    hermes_gateway_stop_timeout_seconds: int = Field(default=20, alias="HERMES_GATEWAY_STOP_TIMEOUT_SECONDS")

    runtime_require_auth: bool = Field(default=False, alias="RUNTIME_REQUIRE_AUTH")
    runtime_allow_legacy_token: bool = Field(default=True, alias="RUNTIME_ALLOW_LEGACY_TOKEN")
    runtime_legacy_token: str = Field(default="", alias="RUNTIME_LEGACY_TOKEN")
    runtime_max_old_versions: int = Field(default=2, alias="RUNTIME_MAX_OLD_VERSIONS")
    runtime_job_log_retention_days: int = Field(default=30, alias="RUNTIME_JOB_LOG_RETENTION_DAYS")
    runtime_gateway_log_retention_days: int = Field(default=14, alias="RUNTIME_GATEWAY_LOG_RETENTION_DAYS")

    # --- Configurable toolchain (user-specified install dirs) ---
    toolchain_python_path: str = Field(default="", alias="TOOLCHAIN_PYTHON_PATH")
    toolchain_node_path: str = Field(default="", alias="TOOLCHAIN_NODE_PATH")
    toolchain_git_path: str = Field(default="", alias="TOOLCHAIN_GIT_PATH")
    toolchain_venv_dir: str = Field(default="", alias="TOOLCHAIN_VENV_DIR")
    hermes_install_dir: str = Field(default="", alias="HERMES_INSTALL_DIR")

    # Team Task Hub (stub / HTTP placeholder)
    team_hub_base_url: str = Field(default="", alias="AIOS_TEAM_HUB_BASE_URL")
    team_hub_token: str = Field(default="", alias="AIOS_TEAM_HUB_TOKEN")
    device_id: str = Field(default="local-device", alias="AIOS_DEVICE_ID")
    agent_id: str = Field(default="hermes-local-agent", alias="AIOS_AGENT_ID")
    task_poll_interval_seconds: float = Field(default=10.0, alias="AIOS_TASK_POLL_INTERVAL_SECONDS")
    team_hub_use_stub: bool = Field(default=True, alias="AIOS_TEAM_HUB_USE_STUB")
    task_reject_sets_cancelled: bool = Field(default=False, alias="AIOS_TASK_REJECT_SETS_CANCELLED")

    # Workers
    run_event_poll_interval_seconds: float = Field(default=2.0, alias="AIOS_RUN_EVENT_POLL_INTERVAL_SECONDS")
    sync_outbox_interval_seconds: float = Field(default=5.0, alias="AIOS_SYNC_OUTBOX_INTERVAL_SECONDS")
    sync_outbox_max_retries: int = Field(default=20, alias="AIOS_SYNC_OUTBOX_MAX_RETRIES")

    task_routing_json: str = Field(
        default="",
        alias="TASK_ROUTING_JSON",
        description='Optional JSON: {"coding_task":{"profile_type":"coding","require_approval":true}}',
    )

    copilot_desktop_token: str = Field(default="", alias="COPILOT_DESKTOP_TOKEN")
    copilot_require_token: bool = Field(default=False, alias="COPILOT_REQUIRE_TOKEN")
    cors_allow_origins: str = Field(
        default="http://127.0.0.1,http://localhost",
        alias="CORS_ALLOW_ORIGINS",
        description=(
            "Comma-separated origins for copilot-desktop renderer; "
            "entries without port allow any port on that host (e.g. Vite :5173)"
        ),
    )

    @field_validator(
        "runtime_data_dir",
        "runtime_log_dir",
        "runtime_download_dir",
        "runtime_staging_dir",
        "runtime_backup_dir",
        "toolchain_python_path",
        "toolchain_node_path",
        "toolchain_git_path",
        "toolchain_venv_dir",
        "hermes_install_dir",
        "hermes_home",
        mode="after",
    )
    @classmethod
    def _normalize_optional_path(cls, value: str) -> str:
        if not value or not str(value).strip():
            return ""
        return _abs_path(value)

    @property
    def sqlite_url(self) -> str:
        path = Path(self.sqlite_path).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{path.as_posix()}"

    @property
    def hermes_home_path(self) -> Path:
        return Path(self.hermes_home).expanduser().resolve()

    @property
    def log_dir_path(self) -> Path:
        if self.runtime_log_dir:
            p = Path(self.runtime_log_dir)
        else:
            p = (_PACKAGE_ROOT / self.log_dir).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def package_root(self) -> Path:
        return _PACKAGE_ROOT

    @property
    def bind_host(self) -> str:
        """Prefer RUNTIME_HOST; fall back to COPILOT_HOST."""
        return self.runtime_host or self.copilot_host

    @property
    def bind_port(self) -> int:
        return self.runtime_port or self.copilot_port

    def resolved_runtime_data_dir(self) -> Path:
        if self.runtime_data_dir:
            return Path(self.runtime_data_dir)
        return default_runtime_data_dir()

    def require_auth(self) -> bool:
        return bool(self.runtime_require_auth or self.copilot_require_token)

    def effective_legacy_token(self) -> str:
        return self.runtime_legacy_token or self.copilot_desktop_token


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
