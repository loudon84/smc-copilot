"""initial opsi-control tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opsi_action_requests",
        sa.Column("request_id", sa.String(80), primary_key=True),
        sa.Column("operation", sa.String(64), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "opsi_action_targets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("request_id", sa.String(80), nullable=False),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=False, server_default=""),
        sa.Column("message", sa.String(512), nullable=False, server_default=""),
        sa.Column("dispatched", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_opsi_action_targets_request_id", "opsi_action_targets", ["request_id"])
    op.create_table(
        "opsi_action_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("request_id", sa.String(80), nullable=False),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("redacted", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_opsi_action_results_request_id", "opsi_action_results", ["request_id"])
    op.create_table(
        "opsi_diagnostics",
        sa.Column("request_id", sa.String(80), primary_key=True),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("issue_code", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("recommended_action", sa.String(256), nullable=False),
        sa.Column("files_json", sa.Text(), nullable=False, server_default="[]"),
    )
    op.create_table(
        "opsi_audit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("request_id", sa.String(80), nullable=False, server_default=""),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("event", sa.String(64), nullable=False),
        sa.Column("detail", sa.String(512), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_opsi_audit_request_id", "opsi_audit", ["request_id"])
    op.create_table(
        "opsi_poll_cursors",
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cursor", sa.String(128), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("opsi_poll_cursors")
    op.drop_table("opsi_audit")
    op.drop_table("opsi_diagnostics")
    op.drop_table("opsi_action_results")
    op.drop_table("opsi_action_targets")
    op.drop_table("opsi_action_requests")
