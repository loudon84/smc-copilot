"""Unit tests for Runtime maintenance apply (PRD v1.5 FR-03)."""

from __future__ import annotations

import zipfile
from pathlib import Path

from local_service.runtime_maintenance import apply_maintenance


# @lat: [[tests#Runtime Service Update#Maintenance apply replaces bundle]]
def test_maintenance_apply_replaces_bundle(tmp_path: Path, monkeypatch) -> None:
    install_dir = tmp_path / "install"
    install_dir.mkdir()
    (install_dir / "old.txt").write_text("old", encoding="utf-8")

    artifact = tmp_path / "runtime-bundle.zip"
    staging_content = tmp_path / "content"
    staging_content.mkdir()
    (staging_content / "runtime").mkdir()
    (staging_content / "runtime" / "new.txt").write_text("new", encoding="utf-8")
    with zipfile.ZipFile(artifact, "w") as zf:
        zf.write(staging_content / "runtime" / "new.txt", arcname="runtime/new.txt")

    db_path = tmp_path / "runtime.db"
    db_path.write_bytes(b"sqlite")
    backup_dir = tmp_path / "backups"

    # Avoid real UserDaemon / health / alembic on unit host
    monkeypatch.setattr(
        "local_service.runtime_maintenance._run",
        lambda *a, **k: type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
    )
    monkeypatch.setattr("local_service.runtime_maintenance._health_ok", lambda *a, **k: True)

    import subprocess

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *a, **k: type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
    )

    result = apply_maintenance(
        artifact=artifact,
        install_dir=install_dir,
        db_path=db_path,
        backup_dir=backup_dir,
        port=18765,
    )
    assert result["ok"] is True
    assert result["applied"] is True
    assert (install_dir / "runtime" / "new.txt").exists()
    assert any(s["step"] == "replace" and s["status"] == "ok" for s in result["steps"])
