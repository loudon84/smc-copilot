"""v1.3 durable task execution queue.

Revision ID: 017_v13_task_execution_queue
Revises: 016_v13_task_domain_sot
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "017_v13_task_execution_queue"
down_revision = "016_v13_task_domain_sot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_execution_queue",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_by", sa.String(length=128), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_execution_queue_task_id", "task_execution_queue", ["task_id"])
    op.create_index("ix_task_execution_queue_run_id", "task_execution_queue", ["run_id"])
    op.create_index("ix_task_execution_queue_status", "task_execution_queue", ["status"])
    op.create_index(
        "ix_task_execution_queue_claim",
        "task_execution_queue",
        ["status", "available_at", "priority", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_task_execution_queue_claim", table_name="task_execution_queue")
    op.drop_index("ix_task_execution_queue_status", table_name="task_execution_queue")
    op.drop_index("ix_task_execution_queue_run_id", table_name="task_execution_queue")
    op.drop_index("ix_task_execution_queue_task_id", table_name="task_execution_queue")
    op.drop_table("task_execution_queue")
