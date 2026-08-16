"""v1.5 production re-entry: verifications, signed gates, attestation v2

Revision ID: 0006_v15_production_reentry
Revises: 0005_v14_inventory
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_v15_production_reentry"
down_revision: str | None = "0005_v14_inventory"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "opsi_rollout_campaigns",
        sa.Column("production_policy_revision", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "opsi_rollout_campaigns",
        sa.Column("production_policy_digest", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column("opsi_rollout_batches", sa.Column("observe_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_rollout_rings", sa.Column("observe_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_rollout_targets", sa.Column("healthy_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "opsi_rollout_targets", sa.Column("parent_action_id", sa.String(80), nullable=False, server_default="")
    )
    op.add_column("opsi_live_gates", sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"))
    op.add_column("opsi_live_gates", sa.Column("signature", sa.Text(), nullable=False, server_default=""))
    op.add_column("opsi_live_gates", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_live_gates", sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("opsi_live_gates", sa.Column("input_digest", sa.String(64), nullable=False, server_default=""))
    op.add_column("opsi_live_gates", sa.Column("key_id", sa.String(128), nullable=False, server_default=""))
    op.add_column(
        "opsi_depot_attestations", sa.Column("algorithm", sa.String(32), nullable=False, server_default="Ed25519")
    )
    op.add_column("opsi_depot_attestations", sa.Column("key_id", sa.String(128), nullable=False, server_default=""))
    op.add_column(
        "opsi_depot_attestations", sa.Column("envelope_digest", sa.String(64), nullable=False, server_default="")
    )
    op.add_column(
        "opsi_depot_attestations", sa.Column("signer_key_id", sa.String(64), nullable=False, server_default="")
    )
    op.add_column(
        "opsi_depot_attestations", sa.Column("readback_digest", sa.String(64), nullable=False, server_default="")
    )
    op.add_column(
        "opsi_depot_attestations", sa.Column("readback_observed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_table(
        "opsi_target_verifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("action_id", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("action_result_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("parent_result_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("product_readback_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("inventory_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("gateway_evidence_ref", sa.String(256), nullable=False, server_default=""),
        sa.Column("work_evidence_ref", sa.String(256), nullable=False, server_default=""),
        sa.Column("desired_version", sa.String(64), nullable=False, server_default=""),
        sa.Column("desired_package", sa.String(32), nullable=False, server_default=""),
        sa.Column("desired_artifact", sa.String(64), nullable=False, server_default=""),
        sa.Column("desired_config", sa.String(64), nullable=False, server_default=""),
        sa.Column("desired_owner", sa.String(32), nullable=False, server_default=""),
        sa.Column("observed_version", sa.String(64), nullable=False, server_default=""),
        sa.Column("observed_package", sa.String(32), nullable=False, server_default=""),
        sa.Column("observed_artifact", sa.String(64), nullable=False, server_default=""),
        sa.Column("observed_config", sa.String(64), nullable=False, server_default=""),
        sa.Column("observed_owner", sa.String(32), nullable=False, server_default=""),
        sa.Column("observed_tasks", sa.String(320), nullable=False, server_default=""),
        sa.Column("observed_health", sa.String(32), nullable=False, server_default=""),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("reason", sa.String(256), nullable=False, server_default=""),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("canonical_digest", sa.String(64), nullable=False, server_default=""),
        sa.UniqueConstraint("campaign_id", "client_id", "action_id", "kind", name="uq_opsi_target_verification"),
    )
    op.create_index("ix_opsi_target_verifications_campaign_id", "opsi_target_verifications", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_opsi_target_verifications_campaign_id", table_name="opsi_target_verifications")
    op.drop_table("opsi_target_verifications")
    op.drop_column("opsi_depot_attestations", "readback_observed_at")
    op.drop_column("opsi_depot_attestations", "readback_digest")
    op.drop_column("opsi_depot_attestations", "signer_key_id")
    op.drop_column("opsi_depot_attestations", "envelope_digest")
    op.drop_column("opsi_depot_attestations", "key_id")
    op.drop_column("opsi_depot_attestations", "algorithm")
    op.drop_column("opsi_live_gates", "key_id")
    op.drop_column("opsi_live_gates", "input_digest")
    op.drop_column("opsi_live_gates", "revoked")
    op.drop_column("opsi_live_gates", "expires_at")
    op.drop_column("opsi_live_gates", "signature")
    op.drop_column("opsi_live_gates", "payload_json")
    op.drop_column("opsi_rollout_targets", "parent_action_id")
    op.drop_column("opsi_rollout_targets", "healthy_at")
    op.drop_column("opsi_rollout_rings", "observe_started_at")
    op.drop_column("opsi_rollout_batches", "observe_started_at")
    op.drop_column("opsi_rollout_campaigns", "production_policy_digest")
    op.drop_column("opsi_rollout_campaigns", "production_policy_revision")
