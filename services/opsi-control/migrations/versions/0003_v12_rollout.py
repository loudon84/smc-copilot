"""v1.2 rollout campaigns, approvals, gates, promotions, outbox

Revision ID: 0003_v12_rollout
Revises: 0002_v11_durable
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_v12_rollout"
down_revision: str | None = "0002_v11_durable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opsi_rollout_campaigns",
        sa.Column("campaign_id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("snapshot_digest", sa.String(64), nullable=False),
        sa.Column("client_ids_json", sa.Text(), nullable=False),
        sa.Column("product_id", sa.String(64), nullable=False),
        sa.Column("product_version", sa.String(64), nullable=False),
        sa.Column("package_version", sa.String(32), nullable=False),
        sa.Column("artifact_digest", sa.String(64), nullable=False),
        sa.Column("signer_key_id", sa.String(64), nullable=False),
        sa.Column("config_revision", sa.Integer(), nullable=False),
        sa.Column("gate_policy_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("evidence_policy_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("creator_id", sa.String(128), nullable=False),
        sa.Column("change_ticket", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(256), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pause_cause", sa.String(64), nullable=False, server_default=""),
        sa.Column("fencing_token", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_check_constraint(
        "ck_rollout_campaign_status",
        "opsi_rollout_campaigns",
        "status IN ('DRAFT','PREFLIGHTING','AWAITING_APPROVAL','RUNNING','PAUSED','OBSERVING',"
        "'ROLLING_BACK','SUCCEEDED','ABORTED','FAILED')",
    )
    op.create_table(
        "opsi_rollout_batches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "campaign_id", sa.String(80), sa.ForeignKey("opsi_rollout_campaigns.campaign_id", ondelete="CASCADE")
        ),
        sa.Column("batch_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("client_ids_json", sa.Text(), nullable=False),
        sa.Column("observe_hours", sa.Integer(), nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("dispatched", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("campaign_id", "batch_index", name="uq_opsi_rollout_batch"),
    )
    op.create_check_constraint(
        "ck_rollout_batch_status",
        "opsi_rollout_batches",
        "status IN ('PENDING','READY','DISPATCHING','VERIFYING','OBSERVING','PASSED','FAILED','PAUSED','ROLLED_BACK')",
    )
    op.create_table(
        "opsi_rollout_targets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "campaign_id", sa.String(80), sa.ForeignKey("opsi_rollout_campaigns.campaign_id", ondelete="CASCADE")
        ),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("batch_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("preflight_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("preflight_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_id", sa.String(80), nullable=False, server_default=""),
        sa.Column("baseline_version", sa.String(64), nullable=False, server_default=""),
        sa.Column("baseline_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("baseline_owner", sa.String(32), nullable=False, server_default="opsi"),
        sa.Column("ineligible_reason", sa.String(256), nullable=False, server_default=""),
        sa.Column("mutated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("active_slot", sa.String(96), nullable=False, server_default="active"),
        sa.UniqueConstraint("campaign_id", "client_id", name="uq_opsi_rollout_target"),
        sa.UniqueConstraint("client_id", "active_slot", name="uq_opsi_rollout_active_client"),
    )
    op.create_check_constraint(
        "ck_rollout_target_status",
        "opsi_rollout_targets",
        "status IN ('PENDING','PREFLIGHT_READY','INELIGIBLE','DISPATCHED','APPLYING','VERIFYING',"
        "'HEALTHY','FAILED','ROLLED_BACK','ROLLBACK_FAILED','SKIPPED')",
    )
    op.create_table(
        "opsi_rollout_approvals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("campaign_revision", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_opsi_rollout_approvals_campaign_id", "opsi_rollout_approvals", ["campaign_id"])
    op.create_table(
        "opsi_rollout_gates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("gate_type", sa.String(64), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(256), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("evaluator", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_rollout_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("event", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("detail", sa.String(512), nullable=False, server_default=""),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_artifact_promotions",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("product_version", sa.String(64), nullable=False, unique=True),
        sa.Column("signer_key_id", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("evidence_ref", sa.String(256), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_rollout_idempotency",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("command", sa.String(32), nullable=False),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("body_digest", sa.String(64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.UniqueConstraint("actor_id", "key", name="uq_opsi_rollout_idempotency"),
    )
    op.create_table(
        "opsi_rollout_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_live_gates",
        sa.Column("gate_id", sa.String(80), primary_key=True),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("evidence_ref", sa.String(256), nullable=False),
        sa.Column("signed_by", sa.String(128), nullable=False),
        sa.Column("immutable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("opsi_live_gates")
    op.drop_table("opsi_rollout_outbox")
    op.drop_table("opsi_rollout_idempotency")
    op.drop_table("opsi_artifact_promotions")
    op.drop_table("opsi_rollout_events")
    op.drop_table("opsi_rollout_gates")
    op.drop_table("opsi_rollout_approvals")
    op.drop_table("opsi_rollout_targets")
    op.drop_table("opsi_rollout_batches")
    op.drop_table("opsi_rollout_campaigns")
