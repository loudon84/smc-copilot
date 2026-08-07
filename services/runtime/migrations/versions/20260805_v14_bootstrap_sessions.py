"""v1.4 bootstrap one-time token sessions

Revision ID: 006_v14_bootstrap_sessions
Revises: 005_v14_mcp_tables
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_v14_bootstrap_sessions"
down_revision = "005_v14_mcp_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bootstrap_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_bootstrap_sessions_status", "bootstrap_sessions", ["status"])
    op.create_index("ix_bootstrap_sessions_token_hash", "bootstrap_sessions", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_bootstrap_sessions_token_hash", table_name="bootstrap_sessions")
    op.drop_index("ix_bootstrap_sessions_status", table_name="bootstrap_sessions")
    op.drop_table("bootstrap_sessions")
