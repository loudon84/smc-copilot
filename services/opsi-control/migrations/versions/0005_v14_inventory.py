"""v1.4 inventory, binding, accelerated policy

Revision ID: 0005_v14_inventory
Revises: 0004_v13_production
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_v14_inventory"
down_revision: str | None = "0004_v13_production"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "opsi_rollout_campaigns",
        sa.Column("pilot_policy_revision", sa.String(64), nullable=False, server_default="accelerated-v1.4"),
    )
    op.add_column(
        "opsi_rollout_campaigns",
        sa.Column("pilot_policy_digest", sa.String(64), nullable=False, server_default=""),
    )
    op.create_table(
        "opsi_endpoint_bindings",
        sa.Column("client_id", sa.String(128), primary_key=True),
        sa.Column("user_sid", sa.String(184), nullable=False),
        sa.Column("user_account", sa.String(128), nullable=False),
        sa.Column("evidence_ref", sa.String(256), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("approved_by", sa.String(128), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(256), nullable=False),
        sa.Column("change_ticket", sa.String(64), nullable=False),
    )
    op.create_table(
        "opsi_endpoint_inventory",
        sa.Column("client_id", sa.String(128), primary_key=True),
        sa.Column("os", sa.String(64), nullable=False, server_default=""),
        sa.Column("last_seen_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("owner", sa.String(32), nullable=False, server_default=""),
        sa.Column("disk_free_mb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("user_sid", sa.String(184), nullable=False, server_default=""),
        sa.Column("user_account", sa.String(128), nullable=False, server_default=""),
        sa.Column("binding_source", sa.String(64), nullable=False, server_default=""),
        sa.Column("binding_observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gateway_healthy", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("previous_version", sa.String(64), nullable=False, server_default=""),
        sa.Column("previous_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("depot_id", sa.String(128), nullable=False, server_default=""),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(64), nullable=False, server_default=""),
        sa.Column("baseline_kind", sa.String(16), nullable=False, server_default="ABSENT"),
        sa.Column("content_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("expiry", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cli_path", sa.String(256), nullable=False, server_default=""),
        sa.Column("cli_version", sa.String(64), nullable=False, server_default=""),
        sa.Column("bootstrap_task", sa.String(160), nullable=False, server_default=""),
        sa.Column("gateway_task", sa.String(160), nullable=False, server_default=""),
        sa.Column("trust_level", sa.String(64), nullable=False, server_default="OPSI_AUTHENTICATED_CHECKSUM"),
        sa.Column("evidence_json", sa.Text(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_opsi_endpoint_inventory_depot", "opsi_endpoint_inventory", ["depot_id", "baseline_kind"])


def downgrade() -> None:
    op.drop_index("ix_opsi_endpoint_inventory_depot", table_name="opsi_endpoint_inventory")
    op.drop_table("opsi_endpoint_inventory")
    op.drop_table("opsi_endpoint_bindings")
    op.drop_column("opsi_rollout_campaigns", "pilot_policy_digest")
    op.drop_column("opsi_rollout_campaigns", "pilot_policy_revision")
