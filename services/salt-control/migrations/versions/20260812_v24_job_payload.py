"""v2.4 control job typed payload persistence."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260812_v24_job_payload"
down_revision = "20260812_v24_ring0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "control_jobs",
        sa.Column("payload_json", postgresql.JSONB(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("control_jobs", "payload_json")
