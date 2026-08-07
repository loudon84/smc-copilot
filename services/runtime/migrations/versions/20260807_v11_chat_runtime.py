"""v1.1 Chat Runtime v2 durable tables (ChatRun / Turn / Event / Queue / Interaction).

Revision ID: 015_v11_chat_runtime
Revises: 014_merge_profile_path_v16
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "015_v11_chat_runtime"
down_revision = "014_merge_profile_path_v16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("client_run_id", sa.String(length=128), nullable=False),
        sa.Column("instance_id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("workspace_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("event_cursor", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_run_id", name="uq_chat_runs_client_run_id"),
    )
    op.create_index("ix_chat_runs_client_run_id", "chat_runs", ["client_run_id"])
    op.create_index("ix_chat_runs_instance_id", "chat_runs", ["instance_id"])
    op.create_index("ix_chat_runs_session_id", "chat_runs", ["session_id"])
    op.create_index("ix_chat_runs_status", "chat_runs", ["status"])

    op.create_table(
        "chat_turns",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("client_turn_id", sa.String(length=128), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("model_id", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("context_json", sa.Text(), nullable=True),
        sa.Column("attachment_ids_json", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["chat_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "client_turn_id", name="uq_chat_turn_client"),
    )
    op.create_index("ix_chat_turns_run_id", "chat_turns", ["run_id"])
    op.create_index("ix_chat_turns_status", "chat_turns", ["status"])

    op.create_table(
        "chat_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("turn_id", sa.String(length=36), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["chat_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["turn_id"], ["chat_turns.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_chat_event_sequence"),
    )
    op.create_index("ix_chat_events_run_id", "chat_events", ["run_id"])
    op.create_index("ix_chat_events_turn_id", "chat_events", ["turn_id"])

    op.create_table(
        "chat_queue_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["chat_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_queue_entries_run_id", "chat_queue_entries", ["run_id"])
    op.create_index("ix_chat_queue_entries_status", "chat_queue_entries", ["status"])

    op.create_table(
        "chat_interactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("turn_id", sa.String(length=36), nullable=True),
        sa.Column("request_id", sa.String(length=128), nullable=False),
        sa.Column("interaction_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["chat_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["turn_id"], ["chat_turns.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "request_id", name="uq_chat_interaction_request"),
    )
    op.create_index("ix_chat_interactions_run_id", "chat_interactions", ["run_id"])
    op.create_index("ix_chat_interactions_turn_id", "chat_interactions", ["turn_id"])
    op.create_index("ix_chat_interactions_status", "chat_interactions", ["status"])


def downgrade() -> None:
    op.drop_table("chat_interactions")
    op.drop_table("chat_queue_entries")
    op.drop_table("chat_events")
    op.drop_table("chat_turns")
    op.drop_table("chat_runs")
