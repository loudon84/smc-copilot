"""v1.3 Phase 4–6: task interactions, routing rules, team binding work_task_id.

Revision ID: 018_v13_task_phase456
Revises: 017_v13_task_execution_queue
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "018_v13_task_phase456"
down_revision = "017_v13_task_execution_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_interactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("interaction_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("prompt_json", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_interactions_task_id", "task_interactions", ["task_id"])

    op.create_table(
        "task_routing_rules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_type", sa.String(length=64), nullable=False),
        sa.Column("profile_type", sa.String(length=64), nullable=False),
        sa.Column("profile_id", sa.String(length=128), nullable=True),
        sa.Column("require_approval", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("execution_mode", sa.String(length=32), nullable=False, server_default="single_agent"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_type", name="uq_task_routing_rules_task_type"),
    )
    op.create_index("ix_task_routing_rules_task_type", "task_routing_rules", ["task_type"])

    with op.batch_alter_table("team_task_bindings") as batch_op:
        batch_op.alter_column("local_task_id", existing_type=sa.String(length=36), nullable=True)
        batch_op.add_column(sa.Column("work_task_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_team_task_bindings_work_task_id",
            "work_tasks",
            ["work_task_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_team_task_bindings_work_task_id", ["work_task_id"])


def downgrade() -> None:
    with op.batch_alter_table("team_task_bindings") as batch_op:
        batch_op.drop_index("ix_team_task_bindings_work_task_id")
        batch_op.drop_constraint("fk_team_task_bindings_work_task_id", type_="foreignkey")
        batch_op.drop_column("work_task_id")
        batch_op.alter_column("local_task_id", existing_type=sa.String(length=36), nullable=False)

    op.drop_index("ix_task_routing_rules_task_type", table_name="task_routing_rules")
    op.drop_table("task_routing_rules")
    op.drop_index("ix_task_interactions_task_id", table_name="task_interactions")
    op.drop_table("task_interactions")
