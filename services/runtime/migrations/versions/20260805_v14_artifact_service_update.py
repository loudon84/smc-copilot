"""v1.4 artifact signature columns and runtime_service_versions

Revision ID: 006_v14_artifact_service_update
Revises: 005_v14_update_plans
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_v14_artifact_service_update"
down_revision = "005_v14_update_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runtime_versions", sa.Column("signature_key_id", sa.String(length=128), nullable=True))
    op.add_column("runtime_versions", sa.Column("artifact_type", sa.String(length=64), nullable=True))
    op.add_column("runtime_versions", sa.Column("manifest_version", sa.String(length=64), nullable=True))
    op.add_column("runtime_versions", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "runtime_service_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="stable"),
        sa.Column("download_url", sa.String(length=2048), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("signature_key_id", sa.String(length=128), nullable=True),
        sa.Column("artifact_path", sa.String(length=1024), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version"),
    )
    op.create_index("ix_runtime_service_versions_version", "runtime_service_versions", ["version"])
    op.create_index("ix_runtime_service_versions_status", "runtime_service_versions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_runtime_service_versions_status", table_name="runtime_service_versions")
    op.drop_index("ix_runtime_service_versions_version", table_name="runtime_service_versions")
    op.drop_table("runtime_service_versions")
    op.drop_column("runtime_versions", "verified_at")
    op.drop_column("runtime_versions", "manifest_version")
    op.drop_column("runtime_versions", "artifact_type")
    op.drop_column("runtime_versions", "signature_key_id")
