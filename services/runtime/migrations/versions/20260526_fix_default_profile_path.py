"""fix default profile_path to hermes_home

Revision ID: 003_fix_default_profile_path
Revises: 002_team_v18_chat
Create Date: 2026-05-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003_fix_default_profile_path"
down_revision = "002_team_v18_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, hermes_home, profile_path
            FROM profiles
            WHERE name = 'default'
            """
        )
    ).fetchall()
    for row in rows:
        hermes_home = str(row.hermes_home or "").rstrip("\\/")
        if not hermes_home:
            continue
        expected_wrong = f"{hermes_home}\\profiles\\default"
        expected_wrong_posix = f"{hermes_home}/profiles/default"
        current = str(row.profile_path or "")
        if current in {expected_wrong, expected_wrong_posix, hermes_home}:
            conn.execute(
                sa.text("UPDATE profiles SET profile_path = :home WHERE id = :id"),
                {"home": hermes_home, "id": row.id},
            )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, hermes_home, profile_path
            FROM profiles
            WHERE name = 'default'
            """
        )
    ).fetchall()
    for row in rows:
        hermes_home = str(row.hermes_home or "").rstrip("\\/")
        if not hermes_home:
            continue
        if str(row.profile_path or "") == hermes_home:
            conn.execute(
                sa.text("UPDATE profiles SET profile_path = :path WHERE id = :id"),
                {"path": f"{hermes_home}\\profiles\\default", "id": row.id},
            )
