"""team_v1.8 workspace chat tables

Revision ID: 002_team_v18_chat
Revises: 001_role_spec
Create Date: 2026-05-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002_team_v18_chat"
down_revision = "001_role_spec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_chat_settings",
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="auto"),
        sa.Column("model_id", sa.String(length=256), nullable=False),
        sa.Column("model_label", sa.String(length=256), nullable=True),
        sa.Column("base_url", sa.String(length=512), nullable=True),
        sa.Column("is_default", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("profile_id"),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "chat_attachments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("original_name", sa.String(length=512), nullable=False),
        sa.Column("safe_name", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("workspace_relative_path", sa.String(length=1024), nullable=False),
        sa.Column("text_preview", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "idx_chat_attachments_session",
        "chat_attachments",
        ["profile_id", "workspace_id", "session_id"],
    )
    op.create_index("idx_chat_attachments_workspace", "chat_attachments", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("idx_chat_attachments_workspace", table_name="chat_attachments")
    op.drop_index("idx_chat_attachments_session", table_name="chat_attachments")
    op.drop_table("chat_attachments")
    op.drop_table("profile_chat_settings")
