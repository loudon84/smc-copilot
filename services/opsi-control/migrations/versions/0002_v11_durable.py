"""v1.1 durable action fields, unique constraints, policies, heartbeats

Revision ID: 0002_v11_durable
Revises: 0001_initial
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_v11_durable"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("opsi_action_requests", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_action_requests", sa.Column("deadline", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "opsi_action_requests", sa.Column("aggregate_version", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("opsi_action_requests", sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"))
    op.add_column("opsi_action_requests", sa.Column("hermes_version", sa.String(64), nullable=False, server_default=""))
    op.add_column("opsi_action_requests", sa.Column("config_revision", sa.Integer(), nullable=True))
    op.add_column("opsi_action_requests", sa.Column("auto_repair_level", sa.Integer(), nullable=True))

    op.add_column("opsi_action_targets", sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("opsi_action_targets", sa.Column("lease_owner", sa.String(128), nullable=False, server_default=""))
    op.add_column("opsi_action_targets", sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_action_targets", sa.Column("property_digest", sa.String(64), nullable=False, server_default=""))
    op.add_column("opsi_action_targets", sa.Column("opsi_action", sa.String(32), nullable=False, server_default=""))
    op.add_column(
        "opsi_action_targets", sa.Column("opsi_modification_time", sa.String(40), nullable=False, server_default="")
    )
    op.add_column("opsi_action_targets", sa.Column("last_observed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("opsi_action_targets", sa.Column("user_sid", sa.String(184), nullable=False, server_default=""))
    op.add_column("opsi_action_targets", sa.Column("user_account", sa.String(128), nullable=False, server_default=""))
    op.create_unique_constraint("uq_opsi_target_request_client", "opsi_action_targets", ["request_id", "client_id"])

    op.add_column("opsi_action_results", sa.Column("bytes", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("opsi_action_results", sa.Column("error_code", sa.String(64), nullable=False, server_default=""))
    op.add_column("opsi_action_results", sa.Column("body_digest", sa.String(64), nullable=False, server_default=""))
    op.create_unique_constraint("uq_opsi_result_request_client", "opsi_action_results", ["request_id", "client_id"])

    op.add_column("opsi_diagnostics", sa.Column("manifest_digest", sa.String(64), nullable=False, server_default=""))
    op.create_unique_constraint("uq_opsi_diag_request_client", "opsi_diagnostics", ["request_id", "client_id"])

    op.create_table(
        "opsi_managed_policies",
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("request_id", sa.String(80), nullable=False, server_default=""),
    )
    op.create_table(
        "opsi_worker_heartbeats",
        sa.Column("worker_id", sa.String(128), primary_key=True),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("opsi_worker_heartbeats")
    op.drop_table("opsi_managed_policies")
    op.drop_constraint("uq_opsi_diag_request_client", "opsi_diagnostics", type_="unique")
    op.drop_column("opsi_diagnostics", "manifest_digest")
    op.drop_constraint("uq_opsi_result_request_client", "opsi_action_results", type_="unique")
    op.drop_column("opsi_action_results", "body_digest")
    op.drop_column("opsi_action_results", "error_code")
    op.drop_column("opsi_action_results", "bytes")
    op.drop_constraint("uq_opsi_target_request_client", "opsi_action_targets", type_="unique")
    op.drop_column("opsi_action_targets", "user_account")
    op.drop_column("opsi_action_targets", "user_sid")
    op.drop_column("opsi_action_targets", "last_observed_at")
    op.drop_column("opsi_action_targets", "opsi_modification_time")
    op.drop_column("opsi_action_targets", "opsi_action")
    op.drop_column("opsi_action_targets", "property_digest")
    op.drop_column("opsi_action_targets", "lease_until")
    op.drop_column("opsi_action_targets", "lease_owner")
    op.drop_column("opsi_action_targets", "attempt")
    op.drop_column("opsi_action_requests", "auto_repair_level")
    op.drop_column("opsi_action_requests", "config_revision")
    op.drop_column("opsi_action_requests", "hermes_version")
    op.drop_column("opsi_action_requests", "payload_json")
    op.drop_column("opsi_action_requests", "aggregate_version")
    op.drop_column("opsi_action_requests", "deadline")
    op.drop_column("opsi_action_requests", "updated_at")
