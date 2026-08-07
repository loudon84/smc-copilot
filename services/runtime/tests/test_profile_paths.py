"""Profile path resolution (v1.3.1 FR-04)."""

from __future__ import annotations

from pathlib import Path

import pytest

from core.runtime_errors import RuntimeServiceError
from runtime.hermes_profile_paths import is_default_profile, profile_config_path, profile_home
from utils.paths import profile_dir


@pytest.fixture
def hermes_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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


def test_default_profile_uses_hermes_home(hermes_settings) -> None:
    settings, hermes = hermes_settings
    assert is_default_profile("default")
    assert is_default_profile("")
    assert profile_home(settings, "default") == settings.hermes_home_path
    assert profile_config_path(settings, "default") == settings.hermes_home_path / "config.yaml"
    assert profile_dir(settings, "default") == settings.hermes_home_path


def test_named_profile_uses_profiles_subdir(hermes_settings) -> None:
    settings, hermes = hermes_settings
    assert not is_default_profile("coding")
    assert profile_home(settings, "coding") == hermes / "profiles" / "coding"
    assert profile_config_path(settings, "coding") == hermes / "profiles" / "coding" / "config.yaml"


def test_invalid_profile_name_rejected(hermes_settings) -> None:
    settings, _hermes = hermes_settings
    with pytest.raises(RuntimeServiceError) as exc:
        profile_home(settings, "../escape")
    assert exc.value.code == "profile_path_invalid"
