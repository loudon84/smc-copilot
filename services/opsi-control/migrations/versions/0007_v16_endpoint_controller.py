"""v1.6 endpoint controller evidence and result acks

Revision ID: 0007_v16_endpoint_controller
Revises: 0006_v15_production_reentry
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_v16_endpoint_controller"
down_revision: str | None = "0006_v15_production_reentry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opsi_controller_evidence",
        sa.Column("client_id", sa.String(128), primary_key=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_digest", sa.String(64), nullable=False, server_default=""),
    )
    op.create_index("ix_opsi_controller_evidence_digest", "opsi_controller_evidence", ["content_digest"])
    op.create_table(
        "opsi_result_acks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("request_id", sa.String(80), nullable=False),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("token", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("request_id", "client_id", name="uq_opsi_result_ack"),
    )
    op.create_index("ix_opsi_result_acks_request_id", "opsi_result_acks", ["request_id"])


def downgrade() -> None:
    op.drop_index("ix_opsi_result_acks_request_id", table_name="opsi_result_acks")
    op.drop_table("opsi_result_acks")
    op.drop_index("ix_opsi_controller_evidence_digest", table_name="opsi_controller_evidence")
    op.drop_table("opsi_controller_evidence")
