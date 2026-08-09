"""Hermes local config service tests (PRD v1.5.3 §83–§89)."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.runtime_errors import RuntimeServiceError
from runtime.local_hermes_profile_policy import require_supported_local_profile
from services.hermes_local_config_service import (
    CREDENTIAL_SOURCE_HERMES_DOTENV,
    HermesLocalConfigService,
    fingerprint_api_server_key,
)


@pytest.fixture
def hermes_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    yield settings, hermes.resolve()
    config_mod._settings = None


def test_default_paths(hermes_home) -> None:
    # @lat: [[tests#Hermes local config#Default paths]]
    settings, hermes = hermes_home
    svc = HermesLocalConfigService(settings)
    assert svc.env_path("default") == hermes / ".env"
    assert svc.config_path("default") == hermes / "config.yaml"
    assert svc.resolve_home("default") == hermes


def test_resolve_api_server_key_from_dotenv(hermes_home) -> None:
    # @lat: [[tests#Hermes local config#Env key resolution]]
    settings, hermes = hermes_home
    (hermes / ".env").write_text("API_SERVER_KEY=test-key-a\n", encoding="utf-8")
    svc = HermesLocalConfigService(settings)
    assert svc.resolve_api_server_key("default") == "test-key-a"
    cred = svc.resolve_credential("default")
    assert cred.configured is True
    assert cred.source == CREDENTIAL_SOURCE_HERMES_DOTENV
    assert cred.key_fingerprint == fingerprint_api_server_key("test-key-a")


def test_missing_api_server_key(hermes_home) -> None:
    settings, hermes = hermes_home
    (hermes / ".env").write_text("DASHSCOPE_API_KEY=sk\n", encoding="utf-8")
    svc = HermesLocalConfigService(settings)
    assert svc.resolve_api_server_key("default") is None
    assert svc.resolve_credential("default").configured is False


def test_config_valid_and_invalid(hermes_home) -> None:
    # @lat: [[tests#Hermes local config#Config parse]]
    settings, hermes = hermes_home
    svc = HermesLocalConfigService(settings)
    missing = svc.read_config("default")
    assert missing.exists is False
    assert missing.valid is False
    assert missing.error_code == "HERMES_CONFIG_NOT_FOUND"

    (hermes / "config.yaml").write_text("model:\n  default: x\ngateway:\n  port: 8642\n", encoding="utf-8")
    ok = svc.read_config("default")
    assert ok.exists is True
    assert ok.valid is True
    assert ok.has_model_or_provider is True

    (hermes / "config.yaml").write_text(":\n  bad: [", encoding="utf-8")
    bad = svc.read_config("default")
    assert bad.exists is True
    assert bad.valid is False
    assert bad.error_code == "HERMES_CONFIG_INVALID"


def test_named_profile_rejected() -> None:
    # @lat: [[tests#Hermes local config#Named profile rejected]]
    with pytest.raises(RuntimeServiceError) as ei:
        require_supported_local_profile("finance")
    assert ei.value.code == "LOCAL_HERMES_PROFILE_UNSUPPORTED"
    assert ei.value.details["supportedProfile"] == "default"


def test_diagnose_redacts_secret(hermes_home) -> None:
    settings, hermes = hermes_home
    (hermes / ".env").write_text('API_SERVER_KEY="secret-value"\n', encoding="utf-8")
    (hermes / "config.yaml").write_text("model: {}\n", encoding="utf-8")
    diag = HermesLocalConfigService(settings).diagnose("default", legacy_runtime_secret_configured=True)
    assert diag.api_server_key_configured is True
    assert diag.key_fingerprint == fingerprint_api_server_key("secret-value")
    assert diag.hermes_home_display == "~/.hermes"
    assert diag.legacy_runtime_secret_configured is True
    assert diag.legacy_runtime_secret_used is False
    assert "secret-value" not in str(diag)
