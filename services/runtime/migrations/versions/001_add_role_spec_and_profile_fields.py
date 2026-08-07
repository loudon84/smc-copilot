"""add profile_role_specs and profile display fields

Revision ID: 001_role_spec
Revises:
Create Date: 2026-05-21

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "001_role_spec"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("profiles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("role", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("role_name", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))

    op.create_table(
        "profile_role_specs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("role_key", sa.String(length=64), nullable=False),
        sa.Column("role_name", sa.String(length=128), nullable=False),
        sa.Column("source_repo", sa.String(length=512), nullable=False),
        sa.Column("source_paths_json", sa.Text(), nullable=False),
        sa.Column("soul_path", sa.String(length=512), nullable=True),
        sa.Column("memory_path", sa.String(length=512), nullable=True),
        sa.Column("source_checksum", sa.String(length=128), nullable=True),
        sa.Column("output_mode", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id"),
    )


def downgrade() -> None:
    op.drop_table("profile_role_specs")
    with op.batch_alter_table("profiles", schema=None) as batch_op:
        batch_op.drop_column("description")
        batch_op.drop_column("role_name")
        batch_op.drop_column("role")
        batch_op.drop_column("display_name")
