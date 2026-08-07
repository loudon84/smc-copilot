"""Add optional AI lineage fields on document_versions

Revision ID: 0002_add_version_ai_fields
Revises: 0001_create_documents_tables
Create Date: 2026-05-01
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_version_ai_fields"
down_revision: Union[str, None] = "0001_create_documents_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_versions", sa.Column("created_from", sa.String(length=32), nullable=True))
    op.add_column("document_versions", sa.Column("related_interaction_id", sa.String(length=64), nullable=True))
    op.add_column("document_versions", sa.Column("related_patch_id", sa.String(length=64), nullable=True))
    op.create_check_constraint(
        "chk_document_versions_created_from",
        "document_versions",
        "created_from IS NULL OR created_from IN ('manual_save', 'ai_patch_apply')",
    )
    op.create_index("idx_document_versions_interaction_id", "document_versions", ["related_interaction_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_document_versions_interaction_id", table_name="document_versions")
    op.drop_constraint("chk_document_versions_created_from", "document_versions", type_="check")
    op.drop_column("document_versions", "related_patch_id")
    op.drop_column("document_versions", "related_interaction_id")
    op.drop_column("document_versions", "created_from")
