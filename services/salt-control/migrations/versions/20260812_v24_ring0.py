"""v2.4 Ring 0 persistence — approvals, observations, incidents, target jobs."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260812_v24_ring0"
down_revision = "20260812_v231_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rollout_approvals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rollout_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.String(length=128), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("snapshot_digest", sa.String(length=128), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rollout_id", "role", "subject", name="uq_rollout_approval_actor"),
    )
    op.create_index("ix_rollout_approvals_rollout_id", "rollout_approvals", ["rollout_id"])

    op.create_table(
        "rollout_observations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rollout_id", sa.String(length=64), nullable=False),
        sa.Column("window", sa.String(length=16), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rollout_observations_rollout_id", "rollout_observations", ["rollout_id"])

    op.create_table(
        "endpoint_observations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("window", sa.String(length=16), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoint_observations_endpoint_id", "endpoint_observations", ["endpoint_id"])

    op.create_table(
        "control_plane_incidents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("rollout_id", sa.String(length=64), nullable=True),
        sa.Column("endpoint_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_redacted", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "rollout_target_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rollout_id", sa.String(length=64), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("batch_index", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("state", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rollout_id", "endpoint_id", "batch_index", name="uq_rollout_target_batch"),
    )
    op.create_index("ix_rollout_target_jobs_rollout_id", "rollout_target_jobs", ["rollout_id"])

    op.add_column("rollouts", sa.Column("snapshot_digest", sa.String(length=128), nullable=True))
    op.add_column("rollouts", sa.Column("snapshot_json", postgresql.JSONB(), nullable=True))
    op.add_column("rollouts", sa.Column("batch_index", sa.Integer(), server_default="0", nullable=False))
    op.add_column("idempotency_keys", sa.Column("request_digest", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("idempotency_keys", "request_digest")
    op.drop_column("rollouts", "batch_index")
    op.drop_column("rollouts", "snapshot_json")
    op.drop_column("rollouts", "snapshot_digest")
    op.drop_index("ix_rollout_target_jobs_rollout_id", table_name="rollout_target_jobs")
    op.drop_table("rollout_target_jobs")
    op.drop_table("control_plane_incidents")
    op.drop_index("ix_endpoint_observations_endpoint_id", table_name="endpoint_observations")
    op.drop_table("endpoint_observations")
    op.drop_index("ix_rollout_observations_rollout_id", table_name="rollout_observations")
    op.drop_table("rollout_observations")
    op.drop_index("ix_rollout_approvals_rollout_id", table_name="rollout_approvals")
    op.drop_table("rollout_approvals")
