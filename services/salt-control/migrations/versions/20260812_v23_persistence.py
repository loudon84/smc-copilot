"""v2.3 durable persistence: enrollment tokens, idempotency, operations

Revision ID: 20260812_v23_persistence
Revises: 20260812_v22_initial
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260812_v23_persistence"
down_revision: str | None = "20260812_v22_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "enrollment_tokens",
        sa.Column("token_hash", sa.String(length=128), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("batch_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "idempotency_keys",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "endpoint_operations",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("enrollment_id", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("request_id"),
    )
    op.create_index("ix_endpoint_operations_endpoint_id", "endpoint_operations", ["endpoint_id"])
    op.create_index("ix_endpoint_operations_enrollment_id", "endpoint_operations", ["enrollment_id"])

    op.create_table(
        "operation_steps",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("step_name", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("salt_jid", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_redacted", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.UniqueConstraint("operation_id", "step_name", name="uq_operation_step"),
    )
    op.create_index("ix_operation_steps_operation_id", "operation_steps", ["operation_id"])


def downgrade() -> None:
    op.drop_index("ix_operation_steps_operation_id", table_name="operation_steps")
    op.drop_table("operation_steps")
    op.drop_index("ix_endpoint_operations_enrollment_id", table_name="endpoint_operations")
    op.drop_index("ix_endpoint_operations_endpoint_id", table_name="endpoint_operations")
    op.drop_table("endpoint_operations")
    op.drop_table("idempotency_keys")
    op.drop_table("enrollment_tokens")
