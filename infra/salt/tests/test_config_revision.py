from __future__ import annotations

from pathlib import Path

from plugin_loader import load_named_util

_config = load_named_util("config_revision")
apply_config = _config.apply_config
list_snapshots = _config.list_snapshots
rollback_config = _config.rollback_config
validate_config = _config.validate_config


def test_validate_rejects_bad_platforms() -> None:
    ok, _ = validate_config({"platforms": "nope"})
    assert ok is False


def test_apply_and_rollback(tmp_path: Path) -> None:
    home = tmp_path / "hermes"
    home.mkdir()
    first = apply_config(home, {"platforms": {"api_server": {"enabled": True}}}, note="rev1")
    assert first["ok"] is True
    second = apply_config(
        home,
        {"platforms": {"api_server": {"enabled": False}}},
        note="rev2",
    )
    assert second["ok"] is True
    assert first["revision"] in list_snapshots(home)
    rolled = rollback_config(home, first["revision"])
    assert rolled["ok"] is True
    text = (home / "config.yaml").read_text(encoding="utf-8")
    assert "true" in text.lower() or "True" in text or "enabled: true" in text.lower()
