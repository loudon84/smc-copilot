"""v1.6 Experience evidence links and fingerprints (PRD FR-1001~1004).

Revision ID: 013_v16_experience
Revises: 012_v16_artifact_workers
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "013_v16_experience"
down_revision = "012_v16_artifact_workers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "experience_evidence_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("evidence_id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("event_sequence_start", sa.Integer(), nullable=True),
        sa.Column("event_sequence_end", sa.Integer(), nullable=True),
        sa.Column("artifact_ids_json", sa.Text(), nullable=True),
        sa.Column("profile_version", sa.String(length=128), nullable=True),
        sa.Column("skill_versions_json", sa.Text(), nullable=True),
        sa.Column("tool_names_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["evidence_id"], ["experience_evidence.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experience_evidence_links_evidence_id", "experience_evidence_links", ["evidence_id"])
    op.create_index("ix_experience_evidence_links_task_id", "experience_evidence_links", ["task_id"])

    op.create_table(
        "experience_fingerprints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("evidence_type", sa.String(length=64), nullable=False),
        sa.Column("repeat_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("successful_reuse_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("user_confirmation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result_quality", sa.Float(), nullable=True),
        sa.Column("policy_compliance", sa.Float(), nullable=True),
        sa.Column("failure_rate", sa.Float(), nullable=True),
        sa.Column("last_evidence_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fingerprint", name="uq_experience_fingerprints_fingerprint"),
    )
    op.create_index("ix_experience_fingerprints_evidence_type", "experience_fingerprints", ["evidence_type"])

    with op.batch_alter_table("experience_evidence") as batch:
        batch.add_column(sa.Column("run_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("fingerprint", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("quality_score", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("experience_evidence") as batch:
        batch.drop_column("quality_score")
        batch.drop_column("fingerprint")
        batch.drop_column("run_id")
    op.drop_table("experience_fingerprints")
    op.drop_table("experience_evidence_links")
