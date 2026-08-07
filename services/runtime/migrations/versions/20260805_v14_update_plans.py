"""v1.4 update plans and job cancel columns

Revision ID: 005_v14_update_plans
Revises: 004_v14_instance_chat
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "005_v14_update_plans"
down_revision = "004_v14_instance_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runtime_update_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("from_version", sa.String(length=64), nullable=True),
        sa.Column("to_version", sa.String(length=64), nullable=False),
        sa.Column("strategy", sa.String(length=32), nullable=False, server_default="rolling"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("affected_instances_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_runtime_update_plans_status", "runtime_update_plans", ["status"])

    op.add_column(
        "runtime_jobs",
        sa.Column("cancellation_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "runtime_jobs",
        sa.Column("rollback_state_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "runtime_jobs",
        sa.Column("operation_id", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("runtime_jobs", "operation_id")
    op.drop_column("runtime_jobs", "rollback_state_json")
    op.drop_column("runtime_jobs", "cancellation_requested_at")
    op.drop_index("ix_runtime_update_plans_status", table_name="runtime_update_plans")
    op.drop_table("runtime_update_plans")
