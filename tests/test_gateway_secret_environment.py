"""Gateway secret environment builder tests (v1.3.1 FR-07)."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.runtime_errors import RuntimeServiceError
from runtime.gateway_environment import (
    RESERVED_ENV_NAMES,
    build_gateway_environment,
    redact_env_for_log,
    validate_secret_name,
)


def test_validate_secret_name() -> None:
    validate_secret_name("DASHSCOPE_API_KEY")
    validate_secret_name("API_SERVER_KEY")
    with pytest.raises(RuntimeServiceError):
        validate_secret_name("path")
    with pytest.raises(RuntimeServiceError):
        validate_secret_name("lowercase")
    with pytest.raises(RuntimeServiceError):
        validate_secret_name("PATH")


def test_build_gateway_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    monkeypatch.setenv("RUNTIME_ALLOW_INSECURE_SECRET_STORE", "true")
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    env = build_gateway_environment(
        settings,
        profile_name="default",
        gateway_port=8642,
        secrets={"DASHSCOPE_API_KEY": "sk-test", "API_SERVER_KEY": "gw-key", "PATH": "hacked"},
        base_env={"PATH": "/usr/bin", "USER": "tester"},
    )
    assert env["HERMES_HOME"] == str(settings.hermes_home_path)
    assert env["API_SERVER_ENABLED"] == "true"
    assert env["API_SERVER_HOST"] == "127.0.0.1"
    assert env["API_SERVER_PORT"] == "8642"
    assert env["API_SERVER_KEY"] == "gw-key"
    assert env["DASHSCOPE_API_KEY"] == "sk-test"
    assert env["PATH"] == "/usr/bin"  # reserved not overridden by secret
    redacted = redact_env_for_log(env)
    assert redacted["DASHSCOPE_API_KEY"] == "***"
    assert redacted["API_SERVER_KEY"] == "***"
    assert "PATH" in RESERVED_ENV_NAMES
    config_mod._settings = None


def test_build_gateway_environment_requires_api_server_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    hermes = tmp_path / "hermes"
    hermes.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    import core.config as config_mod

    config_mod._settings = None
    from core.config import get_settings

    settings = get_settings()
    with pytest.raises(RuntimeServiceError) as ei:
        build_gateway_environment(
            settings,
            profile_name="default",
            gateway_port=8642,
            secrets={"DASHSCOPE_API_KEY": "sk"},
            base_env={"PATH": "/usr/bin"},
        )
    assert ei.value.code == "secret_store_unavailable"
    # Legacy path may omit secrets entirely
    env = build_gateway_environment(
        settings,
        profile_name="default",
        gateway_port=8642,
        secrets=None,
        base_env={"PATH": "/usr/bin"},
        require_api_server_key=False,
    )
    assert "API_SERVER_KEY" not in env
    config_mod._settings = None
