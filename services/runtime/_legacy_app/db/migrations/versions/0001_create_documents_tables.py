"""Create documents tables

Revision ID: 0001_create_documents_tables
Revises:
Create Date: 2026-04-29
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_create_documents_tables"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("engine", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="local"),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=True),
        sa.Column("current_version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("current_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("document_type IN ('spreadsheet')", name="chk_documents_type"),
        sa.CheckConstraint("engine IN ('univer')", name="chk_documents_engine"),
        sa.CheckConstraint("status IN ('draft', 'active', 'archived', 'deleted')", name="chk_documents_status"),
        sa.CheckConstraint("provider IN ('local', 'wecom', 'onlyoffice')", name="chk_documents_provider"),
    )

    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot_bucket", sa.String(length=128), nullable=False),
        sa.Column("snapshot_key", sa.Text(), nullable=False),
        sa.Column("snapshot_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("engine", sa.String(length=32), nullable=False),
        sa.Column("engine_version", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("save_mode", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("engine IN ('univer')", name="chk_document_versions_engine"),
        sa.CheckConstraint("save_mode IN ('manual', 'autosave', 'system')", name="chk_document_versions_save_mode"),
        sa.UniqueConstraint("document_id", "version_no", name="uq_document_versions_doc_version"),
    )

    op.create_table(
        "document_permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("subject_type", sa.String(length=32), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("subject_type IN ('user', 'role', 'department')", name="chk_document_permission_subject"),
        sa.CheckConstraint("role IN ('view', 'edit', 'owner')", name="chk_document_permission_role"),
        sa.UniqueConstraint("document_id", "subject_type", "subject_id", name="uq_document_permission"),
    )

    op.create_table(
        "document_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_index("idx_documents_workspace_status", "documents", ["workspace_id", "status", "updated_at"])
    op.create_index("idx_documents_owner", "documents", ["owner_id", "updated_at"])
    op.create_index("idx_document_versions_document", "document_versions", ["document_id", "version_no"])
    op.create_index("idx_document_permissions_subject", "document_permissions", ["subject_type", "subject_id"])
    op.create_index("idx_document_events_document_created", "document_events", ["document_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_document_events_document_created", table_name="document_events")
    op.drop_index("idx_document_permissions_subject", table_name="document_permissions")
    op.drop_index("idx_document_versions_document", table_name="document_versions")
    op.drop_index("idx_documents_owner", table_name="documents")
    op.drop_index("idx_documents_workspace_status", table_name="documents")

    op.drop_table("document_events")
    op.drop_table("document_permissions")
    op.drop_table("document_versions")
    op.drop_table("documents")
