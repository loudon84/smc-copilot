"""v1.6 resource apply runs, operations, and snapshots.

Revision ID: 009_v16_resource_apply
Revises: 008_v15_endpoint_sync
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_v16_resource_apply"
down_revision = "008_v15_endpoint_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resource_apply_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("revision_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("config_snapshot_ids_json", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_apply_runs_revision", "resource_apply_runs", ["revision"])
    op.create_index("ix_resource_apply_runs_status", "resource_apply_runs", ["status"])

    op.create_table(
        "resource_apply_operations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("from_version", sa.String(length=64), nullable=True),
        sa.Column("to_version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["resource_apply_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_apply_operations_run_id", "resource_apply_operations", ["run_id"])
    op.create_index("ix_resource_apply_operations_status", "resource_apply_operations", ["status"])

    op.create_table(
        "resource_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("operation_id", sa.String(length=36), nullable=True),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("local_path", sa.String(length=1024), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("pointer_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["resource_apply_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_snapshots_run_id", "resource_snapshots", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_resource_snapshots_run_id", table_name="resource_snapshots")
    op.drop_table("resource_snapshots")
    op.drop_index("ix_resource_apply_operations_status", table_name="resource_apply_operations")
    op.drop_index("ix_resource_apply_operations_run_id", table_name="resource_apply_operations")
    op.drop_table("resource_apply_operations")
    op.drop_index("ix_resource_apply_runs_status", table_name="resource_apply_runs")
    op.drop_index("ix_resource_apply_runs_revision", table_name="resource_apply_runs")
    op.drop_table("resource_apply_runs")
