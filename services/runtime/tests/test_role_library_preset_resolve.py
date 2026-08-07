from __future__ import annotations

from pathlib import Path

import pytest

from core.config import get_settings
from schemas.role_library import PresetImportRequest
from services.role_library_service import RoleLibraryService, preset_filenames_for_version


def test_preset_filenames_for_team_v14() -> None:
    names = preset_filenames_for_version("team_v1.4")
    assert names[0] == "hermes-expert-profiles.team_v1.4.yaml"


def test_resolve_preset_yaml_loads_team_v14_file() -> None:
    settings = get_settings()
    svc = RoleLibraryService(settings, None, None)  # type: ignore[arg-type]
    raw = svc._resolve_preset_yaml(PresetImportRequest(preset_version="team_v1.4"))
    assert "version: team_v1.4" in raw
    assert "writer-9601" in raw


def test_team_v14_preset_file_exists_on_disk() -> None:
    root = Path(__file__).resolve().parents[1]
    path = root / "resources" / "profile-presets" / "hermes-expert-profiles.team_v1.4.yaml"
    assert path.is_file(), f"missing preset at {path}"
