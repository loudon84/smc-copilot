"""v1.5.1 Gateway Ownership Recovery — persistent fingerprint fields.

Revision ID: 020_v1_5_1_gateway_fingerprint
Revises: 019_v1_5_hermes_supervisor_state
Create Date: 2026-08-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "020_v1_5_1_gateway_fingerprint"
down_revision = "019_v1_5_hermes_supervisor_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.add_column(sa.Column("gateway_executable_path", sa.String(length=1024), nullable=True))
        batch.add_column(sa.Column("gateway_command_hash", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("gateway_started_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(
            sa.Column("gateway_started_by_runtime", sa.Boolean(), nullable=False, server_default="0")
        )
        batch.add_column(sa.Column("gateway_owner_runtime_id", sa.String(length=36), nullable=True))
        batch.add_column(
            sa.Column("gateway_fingerprint_version", sa.Integer(), nullable=False, server_default="1")
        )


def downgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.drop_column("gateway_fingerprint_version")
        batch.drop_column("gateway_owner_runtime_id")
        batch.drop_column("gateway_started_by_runtime")
        batch.drop_column("gateway_started_at")
        batch.drop_column("gateway_command_hash")
        batch.drop_column("gateway_executable_path")
