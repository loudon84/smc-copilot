"""v1.4 instance-native chat columns

Revision ID: 004_v14_instance_chat
Revises: 003_runtime_core
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004_v14_instance_chat"
down_revision = "003_runtime_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profile_chat_settings",
        sa.Column("instance_id", sa.String(length=36), nullable=True),
    )
    op.create_index(
        "idx_profile_chat_settings_instance_id",
        "profile_chat_settings",
        ["instance_id"],
    )

    op.add_column(
        "chat_attachments",
        sa.Column("instance_id", sa.String(length=36), nullable=True),
    )
    op.create_index(
        "idx_chat_attachments_instance_id",
        "chat_attachments",
        ["instance_id"],
    )

    op.execute(
        """
        UPDATE profile_chat_settings
        SET instance_id = (
            SELECT i.id
            FROM instances i
            INNER JOIN profiles p ON p.name = i.profile_name
            WHERE p.id = profile_chat_settings.profile_id
            LIMIT 1
        )
        WHERE instance_id IS NULL
        """
    )

    op.execute(
        """
        UPDATE chat_attachments
        SET instance_id = (
            SELECT i.id
            FROM instances i
            INNER JOIN profiles p ON p.name = i.profile_name
            WHERE p.id = chat_attachments.profile_id
            LIMIT 1
        )
        WHERE instance_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("idx_chat_attachments_instance_id", table_name="chat_attachments")
    op.drop_column("chat_attachments", "instance_id")
    op.drop_index("idx_profile_chat_settings_instance_id", table_name="profile_chat_settings")
    op.drop_column("profile_chat_settings", "instance_id")
