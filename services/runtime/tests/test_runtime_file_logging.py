"""PRD v1.4.1 — Runtime file logging writes runtime-service.log."""

from __future__ import annotations

# @lat: [[tests#v1.4.1 Hotfix#Runtime file logging dual sink]]

from pathlib import Path

from core.config import Settings
from core.logging import configure_logging, get_logger


def test_configure_logging_writes_rotating_file(tmp_path: Path, monkeypatch) -> None:
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(data))
    monkeypatch.setenv("SQLITE_PATH", str(data / "runtime.db"))
    monkeypatch.setenv("LOG_DIR", str(data / "legacy-logs"))
    settings = Settings()

    # Reset marker so configure_logging can run in this process.
    import logging

    root = logging.getLogger()
    if hasattr(root, "smc_runtime_logging_configured"):
        delattr(root, "smc_runtime_logging_configured")

    configure_logging(settings)
    configure_logging(settings)  # idempotent — must not stack handlers

    file_handlers = [
        h for h in root.handlers if getattr(h, "name", None) == "smc_runtime_file"
    ]
    assert len(file_handlers) == 1

    log = get_logger("runtime.lifecycle")
    log.info("runtime_started", component="runtime.lifecycle")

    log_path = settings.log_dir_path / "runtime-service.log"
    assert log_path.exists()
    text = log_path.read_text(encoding="utf-8")
    assert "runtime_started" in text
    assert str(settings.log_dir_path).endswith("logs") or "logs" in str(settings.log_dir_path)
