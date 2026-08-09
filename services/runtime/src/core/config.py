from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from runtime.platform_paths import default_runtime_data_dir
from runtime.windows_program_paths import (
    default_copilot_runtime_dir,
    default_hermes_install_dir,
    detect_legacy_install_paths,
    is_windows,
)


def _resolve_project_root() -> Path:
    """copilot-serve 仓库根目录（含 pyproject.toml）。"""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "pyproject.toml").is_file():
            return parent
    # src/core/config.py -> copilot-serve
    return here.parents[2]


_PACKAGE_ROOT = _resolve_project_root()

# PRD v1.4 §37: Runtime DB under Runtime data dir, not Desktop/Hermes legacy path.
# Empty default → resolved via RuntimeLayout (runtime.db) at startup; SQLITE_PATH overrides.
_DEFAULT_SQLITE_PATH = ""


def _default_sqlite_path() -> str:
    """%LOCALAPPDATA%/SMC/CopilotRuntime/data/runtime.db on Windows; else ~/.hermes-runtime/data/runtime.db."""
    root = default_runtime_data_dir()
    if is_windows():
        # Prefer SMC CopilotRuntime program data when available
        smc = default_copilot_runtime_dir()
        if smc is not None:
            root = smc
    return str((root / "data" / "runtime.db").expanduser())


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
    sqlite_path: str = Field(default="", alias="SQLITE_PATH")
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
    runtime_service_manifest_url: str = Field(default="", alias="RUNTIME_SERVICE_MANIFEST_URL")
    runtime_manifest_public_keys_json: str = Field(
        default="",
        alias="RUNTIME_MANIFEST_PUBLIC_KEYS_JSON",
        description="JSON map of keyId -> base64 Ed25519 public key for manifest verification",
    )
    artifact_allowed_domains: str = Field(default="", alias="ARTIFACT_ALLOWED_DOMAINS")
    artifact_max_manifest_bytes: int = Field(default=1_048_576, alias="ARTIFACT_MAX_MANIFEST_BYTES")
    artifact_max_artifact_bytes: int = Field(default=500_000_000, alias="ARTIFACT_MAX_ARTIFACT_BYTES")
    artifact_max_archive_files: int = Field(default=10_000, alias="ARTIFACT_MAX_ARCHIVE_FILES")
    artifact_max_archive_total_bytes: int = Field(default=1_000_000_000, alias="ARTIFACT_MAX_ARCHIVE_TOTAL_BYTES")
    hermes_install_timeout_seconds: int = Field(default=900, alias="HERMES_INSTALL_TIMEOUT_SECONDS")
    hermes_doctor_timeout_seconds: int = Field(default=300, alias="HERMES_DOCTOR_TIMEOUT_SECONDS")
    hermes_gateway_start_timeout_seconds: int = Field(default=60, alias="HERMES_GATEWAY_START_TIMEOUT_SECONDS")
    hermes_gateway_stop_timeout_seconds: int = Field(default=20, alias="HERMES_GATEWAY_STOP_TIMEOUT_SECONDS")

    # PRD v1.5 Hermes Supervisor
    gateway_health_interval_seconds: float = Field(default=5.0, alias="GATEWAY_HEALTH_INTERVAL_SECONDS")
    gateway_health_failure_threshold: int = Field(default=3, alias="GATEWAY_HEALTH_FAILURE_THRESHOLD")
    gateway_health_recovery_threshold: int = Field(default=2, alias="GATEWAY_HEALTH_RECOVERY_THRESHOLD")
    gateway_auto_recovery_enabled: bool = Field(default=True, alias="GATEWAY_AUTO_RECOVERY_ENABLED")
    gateway_max_restarts: int = Field(default=3, alias="GATEWAY_MAX_RESTARTS")
    gateway_restart_window_seconds: float = Field(default=300.0, alias="GATEWAY_RESTART_WINDOW_SECONDS")
    # PRD v1.5.1 ownership recovery / safe adoption
    gateway_safe_adoption_enabled: bool = Field(
        default=False,
        alias="HERMES_GATEWAY_SAFE_ADOPTION_ENABLED",
        description="Allow verified orphan Gateway adoption (production default false)",
    )
    gateway_dev_allow_safe_adoption: bool = Field(
        default=True,
        alias="HERMES_DEV_ALLOW_SAFE_ADOPTION",
        description="When deployment_mode=development_stub, enable Safe Adoption",
    )
    gateway_preserve_on_dev_shutdown: bool = Field(
        default=True,
        alias="HERMES_GATEWAY_PRESERVE_ON_DEV_SHUTDOWN",
        description="In development_stub, detach Gateways on shutdown instead of killing (uvicorn --reload)",
    )

    runtime_require_auth: bool = Field(default=False, alias="RUNTIME_REQUIRE_AUTH")
    runtime_allow_legacy_token: bool = Field(default=True, alias="RUNTIME_ALLOW_LEGACY_TOKEN")
    runtime_legacy_token: str = Field(default="", alias="RUNTIME_LEGACY_TOKEN")
    runtime_max_old_versions: int = Field(default=2, alias="RUNTIME_MAX_OLD_VERSIONS")
    runtime_job_log_retention_days: int = Field(default=30, alias="RUNTIME_JOB_LOG_RETENTION_DAYS")
    runtime_gateway_log_retention_days: int = Field(default=14, alias="RUNTIME_GATEWAY_LOG_RETENTION_DAYS")
    chat_event_retention_days: int = Field(default=30, alias="CHAT_EVENT_RETENTION_DAYS")
    runtime_allow_insecure_secret_store: bool = Field(
        default=False,
        alias="RUNTIME_ALLOW_INSECURE_SECRET_STORE",
        description="When true, allow XOR file secret store if DPAPI unavailable (dev only)",
    )

    # --- Configurable toolchain (user-specified install dirs) ---
    toolchain_python_path: str = Field(default="", alias="TOOLCHAIN_PYTHON_PATH")
    toolchain_node_path: str = Field(default="", alias="TOOLCHAIN_NODE_PATH")
    toolchain_git_path: str = Field(default="", alias="TOOLCHAIN_GIT_PATH")
    toolchain_venv_dir: str = Field(default="", alias="TOOLCHAIN_VENV_DIR")
    hermes_install_dir: str = Field(default="", alias="HERMES_INSTALL_DIR")

    # Team Task Hub (stub / HTTP placeholder) — deprecated; prefer Service Center
    team_hub_base_url: str = Field(default="", alias="AIOS_TEAM_HUB_BASE_URL")
    team_hub_token: str = Field(default="", alias="AIOS_TEAM_HUB_TOKEN")
    device_id: str = Field(default="local-device", alias="AIOS_DEVICE_ID")
    agent_id: str = Field(default="hermes-local-agent", alias="AIOS_AGENT_ID")
    task_poll_interval_seconds: float = Field(default=10.0, alias="AIOS_TASK_POLL_INTERVAL_SECONDS")
    team_hub_use_stub: bool = Field(default=False, alias="AIOS_TEAM_HUB_USE_STUB")
    task_reject_sets_cancelled: bool = Field(default=False, alias="AIOS_TASK_REJECT_SETS_CANCELLED")

    # Work Copilot Service Center (PRD v1.5 / v1.6)
    deployment_mode: str = Field(
        default="development_stub",
        alias="AIOS_DEPLOYMENT_MODE",
        description="development_stub | staging_http | production_http",
    )
    service_center_base_url: str = Field(default="", alias="AIOS_SERVICE_CENTER_BASE_URL")
    service_center_use_stub: bool = Field(default=True, alias="AIOS_SERVICE_CENTER_USE_STUB")
    service_center_domain_allowlist: str = Field(
        default="",
        alias="AIOS_SERVICE_CENTER_DOMAIN_ALLOWLIST",
        description="Comma-separated allowed Service Center hostnames",
    )
    service_center_center_public_key: str = Field(
        default="",
        alias="AIOS_SERVICE_CENTER_PUBLIC_KEY",
        description="Base64 Ed25519 public key for Center response / envelope verification",
    )
    service_center_verify_responses: bool = Field(
        default=False,
        alias="AIOS_SERVICE_CENTER_VERIFY_RESPONSES",
    )
    service_center_connect_timeout_seconds: float = Field(
        default=10.0, alias="AIOS_SERVICE_CENTER_CONNECT_TIMEOUT_SECONDS"
    )
    service_center_read_timeout_seconds: float = Field(default=30.0, alias="AIOS_SERVICE_CENTER_READ_TIMEOUT_SECONDS")
    service_center_max_response_bytes: int = Field(default=2_000_000, alias="AIOS_SERVICE_CENTER_MAX_RESPONSE_BYTES")
    endpoint_max_concurrent_runs: int = Field(default=2, alias="AIOS_ENDPOINT_MAX_CONCURRENT_RUNS")
    instance_max_concurrent_runs: int = Field(default=1, alias="AIOS_INSTANCE_MAX_CONCURRENT_RUNS")
    task_event_inline_payload_max_bytes: int = Field(default=65536, alias="AIOS_TASK_EVENT_INLINE_PAYLOAD_MAX_BYTES")
    artifact_multipart_threshold_bytes: int = Field(default=8_000_000, alias="AIOS_ARTIFACT_MULTIPART_THRESHOLD_BYTES")
    endpoint_heartbeat_interval_seconds: float = Field(default=300.0, alias="AIOS_ENDPOINT_HEARTBEAT_INTERVAL_SECONDS")
    sync_poll_interval_seconds: float = Field(default=15.0, alias="AIOS_SYNC_POLL_INTERVAL_SECONDS")
    delivery_outbox_interval_seconds: float = Field(default=5.0, alias="AIOS_DELIVERY_OUTBOX_INTERVAL_SECONDS")
    delivery_outbox_max_retries: int = Field(default=20, alias="AIOS_DELIVERY_OUTBOX_MAX_RETRIES")
    lease_renewal_poll_seconds: float = Field(default=10.0, alias="AIOS_LEASE_RENEWAL_POLL_SECONDS")

    # Workers
    run_event_poll_interval_seconds: float = Field(default=2.0, alias="AIOS_RUN_EVENT_POLL_INTERVAL_SECONDS")
    sync_outbox_interval_seconds: float = Field(default=5.0, alias="AIOS_SYNC_OUTBOX_INTERVAL_SECONDS")
    sync_outbox_max_retries: int = Field(default=20, alias="AIOS_SYNC_OUTBOX_MAX_RETRIES")
    lease_renewal_interval_seconds: float = Field(default=30.0, alias="AIOS_LEASE_RENEWAL_INTERVAL_SECONDS")
    retention_interval_seconds: float = Field(default=3600.0, alias="AIOS_RETENTION_INTERVAL_SECONDS")

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
        raw = (self.sqlite_path or "").strip()
        if not raw:
            from runtime.db_path_migration import default_runtime_control_db, migrate_legacy_desktop_db
            from runtime.platform_paths import RuntimeLayout

            layout = RuntimeLayout.from_root(self.resolved_runtime_data_dir())
            layout.ensure()
            path = migrate_legacy_desktop_db(layout=layout)
        else:
            path = Path(raw).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{path.as_posix()}"

    @property
    def resolved_sqlite_path(self) -> Path:
        raw = (self.sqlite_path or "").strip()
        if raw:
            return Path(raw).expanduser().resolve()
        from runtime.db_path_migration import default_runtime_control_db
        from runtime.platform_paths import RuntimeLayout

        layout = RuntimeLayout.from_root(self.resolved_runtime_data_dir())
        return default_runtime_control_db(layout)

    @property
    def hermes_home_path(self) -> Path:
        return Path(self.hermes_home).expanduser().resolve()

    @property
    def log_dir_path(self) -> Path:
        """Prefer RUNTIME_LOG_DIR; else <RUNTIME_DATA_DIR>/logs (PRD v1.4.1 §37)."""
        if self.runtime_log_dir:
            p = Path(self.runtime_log_dir)
        else:
            from runtime.platform_paths import RuntimeLayout

            p = RuntimeLayout.from_root(self.resolved_runtime_data_dir()).logs
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

    def resolved_hermes_install_dir(self) -> Path | None:
        """Hermes 版本安装根。Windows 默认 %LOCALAPPDATA%\\Programs\\SMC\\HermesAgent；其它平台空则用 Runtime versions/。"""
        if self.hermes_install_dir:
            return Path(self.hermes_install_dir)
        return default_hermes_install_dir()

    def resolved_copilot_runtime_dir(self) -> Path | None:
        """Copilot Runtime 程序根。Windows 默认 %LOCALAPPDATA%\\Programs\\SMC\\CopilotRuntime。"""
        return default_copilot_runtime_dir() if is_windows() else None

    def resolved_toolchain_venv_dir(self) -> Path | None:
        """显式 TOOLCHAIN_VENV_DIR；空则安装时使用 <hermes_install>/<version>/venv。"""
        if self.toolchain_venv_dir:
            return Path(self.toolchain_venv_dir)
        return None

    def enforce_windows_program_paths(self) -> None:
        """Windows install-path policy (FR-13): defaults under SMC; legacy D:\\Programs detected only."""
        if not is_windows():
            return
        # No hard root enforcement — enterprise may override via env. Legacy paths are surfaced for migration.
        detect_legacy_install_paths()

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
