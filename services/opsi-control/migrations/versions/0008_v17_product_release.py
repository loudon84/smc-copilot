"""v1.7 product release catalog

Revision ID: 0008_v17_product_release
Revises: 0007_v16_endpoint_controller
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_v17_product_release"
down_revision: str | None = "0007_v16_endpoint_controller"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opsi_product_releases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.String(128), nullable=False),
        sa.Column("product_version", sa.String(32), nullable=False),
        sa.Column("package_version", sa.String(16), nullable=False),
        sa.Column("controller_revision", sa.String(32), nullable=False, server_default=""),
        sa.Column("controller_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("runtime_catalog_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("release_index_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("attestation_digest", sa.String(64), nullable=False, server_default=""),
        sa.Column("depot_readback_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("signer_key_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("live_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("product_id", "product_version", "package_version", name="uq_opsi_product_release"),
    )
    op.create_index("ix_opsi_product_releases_product_id", "opsi_product_releases", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_opsi_product_releases_product_id", table_name="opsi_product_releases")
    op.drop_table("opsi_product_releases")
