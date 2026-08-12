"""v2.2 initial salt-control schema

Revision ID: 20260812_v22_initial
Revises:
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260812_v22_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "endpoints",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("machine_guid_hash", sa.String(length=128), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=64), nullable=False),
        sa.Column("arch", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("device_credential_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_endpoints_tenant_id", "endpoints", ["tenant_id"])
    op.create_index("ix_endpoints_machine_guid_hash", "endpoints", ["machine_guid_hash"])

    op.create_table(
        "endpoint_user_bindings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("windows_account", sa.String(length=255), nullable=False),
        sa.Column("windows_sid", sa.String(length=128), nullable=False),
        sa.Column("profile_dir", sa.String(length=512), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column("bound_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_endpoint_user_bindings_endpoint_id", "endpoint_user_bindings", ["endpoint_id"])

    op.create_table(
        "enrollments",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("local_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("master_fingerprints", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("request_id"),
    )
    op.create_index("ix_enrollments_endpoint_id", "enrollments", ["endpoint_id"])

    op.create_table(
        "desired_state_revisions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=False),
        sa.Column("source_revision", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_desired_state_revisions_endpoint_id", "desired_state_revisions", ["endpoint_id"])

    op.create_table(
        "job_returns",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("jid", sa.String(length=64), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("function", sa.String(length=255), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("payload_redacted", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("jid", "endpoint_id", "function", name="uq_job_return"),
    )

    op.create_table(
        "artifact_manifests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("component", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("platform", sa.String(length=64), nullable=False),
        sa.Column("arch", sa.String(length=32), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=128), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("manifest_signature", sa.Text(), nullable=False),
        sa.Column("key_id", sa.String(length=128), nullable=False),
        sa.Column("rollback_version", sa.String(length=64), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("component", "version", "platform", "arch", name="uq_artifact_manifest"),
    )

    op.create_table(
        "rollouts",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("component", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("ring", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("thresholds_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("observation_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("target_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("failure_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("rollback_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("p0_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("p1_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "rollout_targets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("rollout_id", sa.String(length=64), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("rollout_id", "endpoint_id", name="uq_rollout_target"),
    )
    op.create_index("ix_rollout_targets_rollout_id", "rollout_targets", ["rollout_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=128), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_redacted", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_index("ix_rollout_targets_rollout_id", table_name="rollout_targets")
    op.drop_table("rollout_targets")
    op.drop_table("rollouts")
    op.drop_table("artifact_manifests")
    op.drop_table("job_returns")
    op.drop_index("ix_desired_state_revisions_endpoint_id", table_name="desired_state_revisions")
    op.drop_table("desired_state_revisions")
    op.drop_index("ix_enrollments_endpoint_id", table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index("ix_endpoint_user_bindings_endpoint_id", table_name="endpoint_user_bindings")
    op.drop_table("endpoint_user_bindings")
    op.drop_index("ix_endpoints_machine_guid_hash", table_name="endpoints")
    op.drop_index("ix_endpoints_tenant_id", table_name="endpoints")
    op.drop_table("endpoints")
