"""v1.6 reliable sync: ack outbox, replay nonces, poison messages.

Revision ID: 009_v16_reliable_sync
Revises: 008_v15_endpoint_sync
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_v16_reliable_sync"
down_revision = "008_v15_endpoint_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sync_ack_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("cursor", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", name="uq_sync_ack_outbox_message_id"),
    )
    op.create_index("ix_sync_ack_outbox_status", "sync_ack_outbox", ["status"])
    op.create_index("ix_sync_ack_outbox_channel", "sync_ack_outbox", ["channel"])
    op.create_index("ix_sync_ack_outbox_endpoint_id", "sync_ack_outbox", ["endpoint_id"])

    op.create_table(
        "sync_replay_nonces",
        sa.Column("nonce", sa.String(length=256), nullable=False),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("nonce"),
    )
    op.create_index("ix_sync_replay_nonces_message_id", "sync_replay_nonces", ["message_id"])

    op.create_table(
        "sync_poison_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="quarantined"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("quarantined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", name="uq_sync_poison_message_id"),
    )
    op.create_index("ix_sync_poison_messages_channel", "sync_poison_messages", ["channel"])

    op.add_column(
        "sync_inbox",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("sync_inbox", sa.Column("last_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("sync_inbox", "last_error")
    op.drop_column("sync_inbox", "attempt_count")
    op.drop_table("sync_poison_messages")
    op.drop_table("sync_replay_nonces")
    op.drop_table("sync_ack_outbox")
