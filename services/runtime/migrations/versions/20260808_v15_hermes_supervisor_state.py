"""v1.5 Hermes Supervisor desired/observed state fields.

Revision ID: 019_v1_5_hermes_supervisor_state
Revises: 018_v13_task_phase456
Create Date: 2026-08-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "019_v1_5_hermes_supervisor_state"
down_revision = "018_v13_task_phase456"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.add_column(sa.Column("desired_state", sa.String(length=32), nullable=False, server_default="stopped"))
        batch.add_column(sa.Column("process_state", sa.String(length=32), nullable=False, server_default="unknown"))
        batch.add_column(sa.Column("api_state", sa.String(length=32), nullable=False, server_default="unknown"))
        batch.add_column(sa.Column("ownership_state", sa.String(length=32), nullable=False, server_default="unknown"))
        batch.add_column(sa.Column("process_create_time", sa.Float(), nullable=True))
        batch.add_column(sa.Column("last_health_check_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("last_healthy_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("last_transition_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(
            sa.Column("consecutive_health_failures", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("consecutive_health_successes", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(sa.Column("restart_count", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("last_error_code", sa.String(length=64), nullable=True))

    # Migrate desired_state from auto_start; do NOT trust legacy healthy as observed.
    # Force healthy=false so chatReady cannot false-positive before first Health Worker probe.
    op.execute(
        sa.text(
            "UPDATE instances SET desired_state = CASE WHEN auto_start = 1 THEN 'running' ELSE 'stopped' END, "
            "process_state = 'unknown', api_state = 'unknown', ownership_state = 'unknown', "
            "healthy = 0, consecutive_health_failures = 0, consecutive_health_successes = 0"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("instances") as batch:
        batch.drop_column("last_error_code")
        batch.drop_column("restart_count")
        batch.drop_column("consecutive_health_successes")
        batch.drop_column("consecutive_health_failures")
        batch.drop_column("last_transition_at")
        batch.drop_column("last_healthy_at")
        batch.drop_column("last_health_check_at")
        batch.drop_column("process_create_time")
        batch.drop_column("ownership_state")
        batch.drop_column("api_state")
        batch.drop_column("process_state")
        batch.drop_column("desired_state")
