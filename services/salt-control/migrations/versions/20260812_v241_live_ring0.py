"""v2.4.1 Live Ring 0 schema — state version, reconcile, evidence, approvals."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260812_v241_live_ring0"
down_revision = "20260812_v24_job_payload"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rollouts", sa.Column("state_version", sa.Integer(), server_default="0", nullable=False))
    op.add_column("rollouts", sa.Column("batch_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollouts", sa.Column("batch_observation_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollouts", sa.Column("final_observation_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollouts", sa.Column("final_observation_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollouts", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("rollout_targets", sa.Column("batch_index", sa.Integer(), server_default="0", nullable=False))
    op.add_column("rollout_targets", sa.Column("state_version", sa.Integer(), server_default="0", nullable=False))
    op.add_column("rollout_targets", sa.Column("source_job_id", sa.String(length=64), nullable=True))
    op.add_column("rollout_targets", sa.Column("reason_code", sa.String(length=64), nullable=True))
    op.add_column("rollout_targets", sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollout_targets", sa.Column("state_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollout_targets", sa.Column("observing_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollout_targets", sa.Column("observing_due_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "rollout_target_jobs", sa.Column("operation", sa.String(length=64), server_default="handover", nullable=False)
    )
    op.add_column("rollout_target_jobs", sa.Column("attempt", sa.Integer(), server_default="1", nullable=False))
    op.add_column("rollout_target_jobs", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    op.add_column("rollout_target_jobs", sa.Column("expected_function", sa.String(length=255), nullable=True))
    op.add_column("rollout_target_jobs", sa.Column("result_source", sa.String(length=32), nullable=True))
    op.drop_constraint("uq_rollout_target_batch", "rollout_target_jobs", type_="unique")
    op.create_unique_constraint(
        "uq_rollout_target_batch_op_attempt",
        "rollout_target_jobs",
        ["rollout_id", "endpoint_id", "batch_index", "operation", "attempt"],
    )

    op.add_column("control_jobs", sa.Column("expected_function", sa.String(length=255), nullable=True))
    op.add_column("control_jobs", sa.Column("result_redacted", postgresql.JSONB(), nullable=True))
    op.add_column("control_jobs", sa.Column("result_schema_version", sa.String(length=32), nullable=True))
    op.add_column("control_jobs", sa.Column("result_source", sa.String(length=32), nullable=True))
    op.add_column("control_jobs", sa.Column("result_captured_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "control_jobs", sa.Column("reconcile_ttl_seconds", sa.Integer(), server_default="3600", nullable=False)
    )

    op.add_column(
        "rollout_approvals", sa.Column("stage", sa.String(length=32), server_default="deploy", nullable=False)
    )
    op.add_column(
        "rollout_approvals",
        sa.Column("role_source", sa.String(length=64), server_default="request_body", nullable=False),
    )
    op.add_column("rollout_approvals", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rollout_approvals", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint("uq_rollout_approval_actor", "rollout_approvals", type_="unique")
    op.create_unique_constraint(
        "uq_rollout_approval_stage_role",
        "rollout_approvals",
        ["rollout_id", "stage", "role"],
    )

    op.create_table(
        "evidence_bundles",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("rollout_id", sa.String(length=64), nullable=False),
        sa.Column("manifest_digest", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="not_proven"),
        sa.Column("signer", sa.String(length=128), nullable=True),
        sa.Column("archive_path", sa.Text(), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_bundles_rollout_id", "evidence_bundles", ["rollout_id"])

    op.create_table(
        "endpoint_fact_samples",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="observer"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoint_fact_samples_endpoint_id", "endpoint_fact_samples", ["endpoint_id"])
    op.create_index("ix_endpoint_fact_samples_captured_at", "endpoint_fact_samples", ["captured_at"])


def downgrade() -> None:
    op.drop_index("ix_endpoint_fact_samples_captured_at", table_name="endpoint_fact_samples")
    op.drop_index("ix_endpoint_fact_samples_endpoint_id", table_name="endpoint_fact_samples")
    op.drop_table("endpoint_fact_samples")
    op.drop_index("ix_evidence_bundles_rollout_id", table_name="evidence_bundles")
    op.drop_table("evidence_bundles")

    op.drop_constraint("uq_rollout_approval_stage_role", "rollout_approvals", type_="unique")
    op.create_unique_constraint(
        "uq_rollout_approval_actor",
        "rollout_approvals",
        ["rollout_id", "role", "subject"],
    )
    op.drop_column("rollout_approvals", "revoked_at")
    op.drop_column("rollout_approvals", "expires_at")
    op.drop_column("rollout_approvals", "role_source")
    op.drop_column("rollout_approvals", "stage")

    op.drop_column("control_jobs", "reconcile_ttl_seconds")
    op.drop_column("control_jobs", "result_captured_at")
    op.drop_column("control_jobs", "result_source")
    op.drop_column("control_jobs", "result_schema_version")
    op.drop_column("control_jobs", "result_redacted")
    op.drop_column("control_jobs", "expected_function")

    op.drop_constraint("uq_rollout_target_batch_op_attempt", "rollout_target_jobs", type_="unique")
    op.create_unique_constraint(
        "uq_rollout_target_batch",
        "rollout_target_jobs",
        ["rollout_id", "endpoint_id", "batch_index"],
    )
    op.drop_column("rollout_target_jobs", "result_source")
    op.drop_column("rollout_target_jobs", "expected_function")
    op.drop_column("rollout_target_jobs", "idempotency_key")
    op.drop_column("rollout_target_jobs", "attempt")
    op.drop_column("rollout_target_jobs", "operation")

    op.drop_column("rollout_targets", "observing_due_at")
    op.drop_column("rollout_targets", "observing_started_at")
    op.drop_column("rollout_targets", "state_changed_at")
    op.drop_column("rollout_targets", "observed_at")
    op.drop_column("rollout_targets", "reason_code")
    op.drop_column("rollout_targets", "source_job_id")
    op.drop_column("rollout_targets", "state_version")
    op.drop_column("rollout_targets", "batch_index")

    op.drop_column("rollouts", "completed_at")
    op.drop_column("rollouts", "final_observation_due_at")
    op.drop_column("rollouts", "final_observation_started_at")
    op.drop_column("rollouts", "batch_observation_due_at")
    op.drop_column("rollouts", "batch_started_at")
    op.drop_column("rollouts", "state_version")
