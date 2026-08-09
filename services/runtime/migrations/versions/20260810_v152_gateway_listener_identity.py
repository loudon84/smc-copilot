"""v1.5.2 Gateway Listener Identity — launcher/listener fingerprint fields.

Revision ID: 021_v1_5_2_gateway_listener_identity
Revises: 020_v1_5_1_gateway_fingerprint
Create Date: 2026-08-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "021_v1_5_2_gateway_listener_identity"
down_revision = "020_v1_5_1_gateway_fingerprint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.add_column(sa.Column("gateway_launcher_pid", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("gateway_launcher_create_time", sa.Float(), nullable=True))
        batch.add_column(sa.Column("gateway_listener_pid", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("gateway_listener_create_time", sa.Float(), nullable=True))
        batch.add_column(
            sa.Column("gateway_listener_executable_path", sa.String(length=1024), nullable=True)
        )

    # PRD §12 — existing pid is launcher-era; do NOT copy to listener_pid.
    # Leave listener NULL so boot reconcile rediscovers.
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE instances SET gateway_launcher_pid = pid "
            "WHERE pid IS NOT NULL AND gateway_launcher_pid IS NULL"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.drop_column("gateway_listener_executable_path")
        batch.drop_column("gateway_listener_create_time")
        batch.drop_column("gateway_listener_pid")
        batch.drop_column("gateway_launcher_create_time")
        batch.drop_column("gateway_launcher_pid")
