"""v1.6 artifact upload sessions and worker states (PRD FR-701, FR-801).

Revision ID: 012_v16_artifact_workers
Revises: 011_v16_work_tasks
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "012_v16_artifact_workers"
down_revision = "011_v16_work_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artifact_upload_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("spool_entry_id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=128), nullable=False),
        sa.Column("artifact_id", sa.String(length=128), nullable=True),
        sa.Column("upload_id", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="initiated"),
        sa.Column("total_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("part_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_artifact_upload_sessions_spool_entry_id", "artifact_upload_sessions", ["spool_entry_id"])
    op.create_index("ix_artifact_upload_sessions_assignment_id", "artifact_upload_sessions", ["assignment_id"])

    op.create_table(
        "artifact_upload_parts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("part_number", sa.Integer(), nullable=False),
        sa.Column("etag", sa.String(length=256), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["artifact_upload_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "part_number", name="uq_artifact_upload_part"),
    )
    op.create_index("ix_artifact_upload_parts_session_id", "artifact_upload_parts", ["session_id"])

    op.create_table(
        "worker_states",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="stopped"),
        sa.Column("critical", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_tick_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=128), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_worker_state_name"),
    )

    op.create_table(
        "worker_incidents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("worker_name", sa.String(length=128), nullable=False),
        sa.Column("incident_type", sa.String(length=64), nullable=False),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_worker_incidents_worker_name", "worker_incidents", ["worker_name"])


def downgrade() -> None:
    op.drop_index("ix_worker_incidents_worker_name", table_name="worker_incidents")
    op.drop_table("worker_incidents")
    op.drop_table("worker_states")
    op.drop_index("ix_artifact_upload_parts_session_id", table_name="artifact_upload_parts")
    op.drop_table("artifact_upload_parts")
    op.drop_index("ix_artifact_upload_sessions_assignment_id", table_name="artifact_upload_sessions")
    op.drop_index("ix_artifact_upload_sessions_spool_entry_id", table_name="artifact_upload_sessions")
    op.drop_table("artifact_upload_sessions")
