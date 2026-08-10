"""v1.6 Chat Capability Closure — session_chat_settings, chat_runs kind, attachment roles.

Revision ID: 022_v1_6_chat_capability_closure
Revises: 021_v1_5_2_gateway_listener_identity
Create Date: 2026-08-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "022_v1_6_chat_capability_closure"
down_revision = "021_v1_5_2_gateway_listener_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_chat_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("instance_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("model_id", sa.String(length=256), nullable=True),
        sa.Column("context_folder", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("instance_id", "session_id", name="uq_session_chat_settings"),
    )
    op.create_index("ix_session_chat_settings_instance_id", "session_chat_settings", ["instance_id"])
    op.create_index("ix_session_chat_settings_session_id", "session_chat_settings", ["session_id"])

    with op.batch_alter_table("chat_runs") as batch:
        batch.add_column(sa.Column("run_kind", sa.String(length=32), nullable=False, server_default="main"))
        batch.add_column(sa.Column("parent_run_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("parent_turn_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_chat_runs_run_kind", ["run_kind"])
        batch.create_index("ix_chat_runs_parent_run_id", ["parent_run_id"])

    with op.batch_alter_table("chat_attachments") as batch:
        batch.add_column(
            sa.Column("role", sa.String(length=32), nullable=False, server_default="prompt_attachment")
        )
        batch.add_column(sa.Column("is_context", sa.Integer(), nullable=False, server_default="0"))
        batch.create_index("ix_chat_attachments_role", ["role"])


def downgrade() -> None:
    with op.batch_alter_table("chat_attachments") as batch:
        batch.drop_index("ix_chat_attachments_role")
        batch.drop_column("is_context")
        batch.drop_column("role")

    with op.batch_alter_table("chat_runs") as batch:
        batch.drop_index("ix_chat_runs_parent_run_id")
        batch.drop_index("ix_chat_runs_run_kind")
        batch.drop_column("parent_turn_id")
        batch.drop_column("parent_run_id")
        batch.drop_column("run_kind")

    op.drop_index("ix_session_chat_settings_session_id", table_name="session_chat_settings")
    op.drop_index("ix_session_chat_settings_instance_id", table_name="session_chat_settings")
    op.drop_table("session_chat_settings")
