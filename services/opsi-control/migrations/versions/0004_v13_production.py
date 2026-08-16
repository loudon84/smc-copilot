"""v1.3 production rings, depots, attestations, freezes, leases

Revision ID: 0004_v13_production
Revises: 0003_v12_rollout
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_v13_production"
down_revision: str | None = "0003_v12_rollout"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("opsi_rollout_campaigns", sa.Column("mode", sa.String(16), nullable=False, server_default="pilot"))
    op.add_column(
        "opsi_rollout_campaigns", sa.Column("mapping_digest", sa.String(64), nullable=False, server_default="")
    )
    op.add_column(
        "opsi_rollout_campaigns", sa.Column("freeze_revision", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("opsi_rollout_batches", sa.Column("observe_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_rollout_targets", sa.Column("depot_id", sa.String(128), nullable=False, server_default=""))
    op.add_column("opsi_rollout_targets", sa.Column("ring_index", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_opsi_rollout_targets_status", "opsi_rollout_targets", ["campaign_id", "status", "client_id"])
    op.create_index("ix_opsi_rollout_targets_depot", "opsi_rollout_targets", ["campaign_id", "depot_id", "ring_index"])
    op.create_table(
        "opsi_rollout_depots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("depot_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("client_ids_json", sa.Text(), nullable=False),
        sa.Column("mapping_digest", sa.String(64), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("attestation_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("campaign_id", "depot_id", name="uq_opsi_rollout_depot"),
    )
    op.create_table(
        "opsi_rollout_rings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("ring_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("client_ids_json", sa.Text(), nullable=False),
        sa.Column("observe_hours", sa.Integer(), nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("observe_until", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("campaign_id", "ring_index", name="uq_opsi_rollout_ring"),
    )
    op.create_table(
        "opsi_depot_attestations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("depot_id", sa.String(128), nullable=False),
        sa.Column("product_id", sa.String(64), nullable=False),
        sa.Column("product_version", sa.String(64), nullable=False),
        sa.Column("package_version", sa.String(32), nullable=False),
        sa.Column("artifact_digest", sa.String(64), nullable=False),
        sa.Column("issuer", sa.String(64), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column("evidence_ref", sa.String(256), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "opsi_release_freezes",
        sa.Column("freeze_id", sa.String(80), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cause", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("cleared_by", sa.String(128), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_fleet_compliance",
        sa.Column("snapshot_id", sa.String(80), primary_key=True),
        sa.Column("campaign_id", sa.String(80), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_rollout_leases",
        sa.Column("lease_key", sa.String(160), primary_key=True),
        sa.Column("owner", sa.String(128), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fencing_token", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("opsi_rollout_leases")
    op.drop_table("opsi_fleet_compliance")
    op.drop_table("opsi_release_freezes")
    op.drop_table("opsi_depot_attestations")
    op.drop_table("opsi_rollout_rings")
    op.drop_table("opsi_rollout_depots")
    op.drop_index("ix_opsi_rollout_targets_depot", table_name="opsi_rollout_targets")
    op.drop_index("ix_opsi_rollout_targets_status", table_name="opsi_rollout_targets")
    op.drop_column("opsi_rollout_targets", "ring_index")
    op.drop_column("opsi_rollout_targets", "depot_id")
    op.drop_column("opsi_rollout_batches", "observe_until")
    op.drop_column("opsi_rollout_campaigns", "freeze_revision")
    op.drop_column("opsi_rollout_campaigns", "mapping_digest")
    op.drop_column("opsi_rollout_campaigns", "mode")
