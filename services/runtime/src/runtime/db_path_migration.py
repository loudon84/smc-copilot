from __future__ import annotations

"""Migrate legacy Desktop sqlite.db into RuntimeLayout runtime.db (PRD v1.4 §37-38)."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from core.logging import get_logger
from runtime.platform_paths import RuntimeLayout

logger = get_logger(__name__)

LEGACY_SQLITE = Path("~/.hermes/desktop/sqlite.db").expanduser()
MIGRATION_MARKER_NAME = "runtime-db-migration-v1.json"


def default_runtime_control_db(layout: RuntimeLayout) -> Path:
    """Canonical Runtime control DB path under Runtime data dir."""
    layout.ensure()
    return layout.db_path


def migrate_legacy_desktop_db(*, layout: RuntimeLayout, target_db: Path | None = None) -> Path:
    """
    If new Runtime DB is missing and legacy ~/.hermes/desktop/sqlite.db exists:
    backup → copy → write migration marker.
    Alembic upgrade is performed by the normal startup path after this returns.
    """
    layout.ensure()
    target = target_db or default_runtime_control_db(layout)
    target.parent.mkdir(parents=True, exist_ok=True)
    marker = layout.root / MIGRATION_MARKER_NAME

    if target.exists():
        return target

    if not LEGACY_SQLITE.exists():
        return target

    backup_dir = layout.backups / "legacy-db"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"sqlite.db.bak-{stamp}"
    shutil.copy2(LEGACY_SQLITE, backup_path)
    shutil.copy2(LEGACY_SQLITE, target)
    marker.write_text(
        json.dumps(
            {
                "marker": "runtime-db-migration-v1",
                "migratedAt": datetime.now(UTC).isoformat(),
                "legacyPath": str(LEGACY_SQLITE),
                "targetPath": str(target),
                "backupPath": str(backup_path),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info(
        "runtime_db_migrated_from_legacy",
        legacy=str(LEGACY_SQLITE),
        target=str(target),
        backup=str(backup_path),
    )
    return target
