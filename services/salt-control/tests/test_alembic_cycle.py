from __future__ import annotations

import pytest
from alembic import command
from alembic.config import Config


def _alembic_config() -> Config:
    cfg = Config("alembic.ini")
    return cfg


@pytest.mark.integration
def test_alembic_upgrade_downgrade_upgrade_cycle(monkeypatch):
    """Requires DATABASE_URL pointing at a real PostgreSQL (CI service)."""
    import os

    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith("postgresql"):
        pytest.skip("DATABASE_URL postgresql required for alembic cycle")
    # Alembic env uses sync URL via env.py — ensure asyncpg URL still works if env maps it.
    cfg = _alembic_config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
