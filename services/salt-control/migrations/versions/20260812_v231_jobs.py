"""v2.3.1 control jobs and secret scope persistence."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260812_v231_jobs"
down_revision = "20260812_v23_persistence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "control_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("minion_id", sa.String(length=64), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("config_revision", sa.String(length=64), nullable=True),
        sa.Column("release_id", sa.String(length=64), nullable=True),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("correlation_id", sa.String(length=64), nullable=True),
        sa.Column("claim_token", sa.String(length=64), nullable=True),
        sa.Column("lease_owner", sa.String(length=128), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("salt_jid", sa.String(length=64), nullable=True),
        sa.Column("result_digest", sa.String(length=128), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("salt_jid", name="uq_control_job_salt_jid"),
    )
    op.create_index("ix_control_jobs_endpoint_id", "control_jobs", ["endpoint_id"])
    op.create_index("ix_control_jobs_minion_id", "control_jobs", ["minion_id"])
    op.create_index("ix_control_jobs_status", "control_jobs", ["status"])
    op.create_index("ix_control_jobs_correlation_id", "control_jobs", ["correlation_id"])

    op.create_table(
        "secret_scopes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("scope_type", sa.String(length=64), nullable=False),
        sa.Column("scope_key", sa.String(length=128), nullable=False),
        sa.Column("secret_ref", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False, server_default="1"),
        sa.Column("checksum_redacted", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "endpoint_id", "scope_type", "scope_key", name="uq_secret_scope"),
    )
    op.create_index("ix_secret_scopes_endpoint_id", "secret_scopes", ["endpoint_id"])


def downgrade() -> None:
    op.drop_index("ix_secret_scopes_endpoint_id", table_name="secret_scopes")
    op.drop_table("secret_scopes")
    op.drop_index("ix_control_jobs_correlation_id", table_name="control_jobs")
    op.drop_index("ix_control_jobs_status", table_name="control_jobs")
    op.drop_index("ix_control_jobs_minion_id", table_name="control_jobs")
    op.drop_index("ix_control_jobs_endpoint_id", table_name="control_jobs")
    op.drop_table("control_jobs")
