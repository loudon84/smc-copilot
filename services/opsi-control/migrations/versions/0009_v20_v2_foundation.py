"""v2.0 managed endpoint data foundation

Revision ID: 0009_v20_v2_foundation
Revises: 0008_v17_product_release
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_v20_v2_foundation"
down_revision: str | None = "0008_v17_product_release"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opsi_hermes_releases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("release_version", sa.String(64), nullable=False),
        sa.Column("hermes_version", sa.String(32), nullable=False, server_default=""),
        sa.Column("smc_revision", sa.String(16), nullable=False, server_default=""),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("manifest_sha256", sa.String(64), nullable=False, server_default=""),
        sa.Column("signer_key_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("artifact_id", sa.String(80), nullable=False, server_default=""),
        sa.Column("live_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("release_version", name="uq_opsi_hermes_release_version"),
    )
    op.create_index("ix_opsi_hermes_releases_release_version", "opsi_hermes_releases", ["release_version"])

    op.create_table(
        "opsi_config_artifacts",
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("artifact_id", sa.String(80), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.String(128), nullable=False, server_default=""),
    )

    op.create_table(
        "opsi_v2_artifacts",
        sa.Column("artifact_id", sa.String(80), primary_key=True),
        sa.Column("artifact_type", sa.String(32), nullable=False),
        sa.Column("request_id", sa.String(80), nullable=False, server_default=""),
        sa.Column("client_id", sa.String(128), nullable=False, server_default=""),
        sa.Column("sha256", sa.String(64), nullable=False, server_default=""),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_opsi_v2_artifacts_request_id", "opsi_v2_artifacts", ["request_id"])
    op.create_index("ix_opsi_v2_artifacts_client_id", "opsi_v2_artifacts", ["client_id"])

    op.create_table(
        "opsi_client_snapshots",
        sa.Column("client_id", sa.String(128), primary_key=True),
        sa.Column("reachable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("opsi_client_snapshots")
    op.drop_index("ix_opsi_v2_artifacts_client_id", table_name="opsi_v2_artifacts")
    op.drop_index("ix_opsi_v2_artifacts_request_id", table_name="opsi_v2_artifacts")
    op.drop_table("opsi_v2_artifacts")
    op.drop_table("opsi_config_artifacts")
    op.drop_index("ix_opsi_hermes_releases_release_version", table_name="opsi_hermes_releases")
    op.drop_table("opsi_hermes_releases")
