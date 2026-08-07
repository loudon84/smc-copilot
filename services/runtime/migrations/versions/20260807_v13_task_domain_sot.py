"""v1.3 Task Domain SOT: WorkTask field extensions + LocalTask → WorkTask data migration.

Revision ID: 016_v13_task_domain_sot
Revises: 015_v11_chat_runtime
Create Date: 2026-08-07
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "016_v13_task_domain_sot"
down_revision = "015_v11_chat_runtime"
branch_labels = None
depends_on = None

_STATUS_MAP = {
    "created": "draft",
    "pending": "ready",
    "queued": "queued",
    "running": "running",
    "waiting_approval": "waiting_approval",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "expired": "expired",
}

_TYPE_MAP = {
    "coding_task": "coding",
    "general": "business",
    "remote": "remote_assignment",
    "local": "coding",
    "chat": "chat",
    "expert": "expert",
    "expert_team": "expert_team",
    "web": "web",
    "workflow": "workflow",
    "coding": "coding",
    "business": "business",
    "remote_assignment": "remote_assignment",
}


def upgrade() -> None:
    with op.batch_alter_table("work_tasks") as batch:
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("assigned_profile_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("assigned_instance_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("workspace_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("active_run_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("chat_run_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("parent_task_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("result_summary", sa.Text(), nullable=True))
        batch.add_column(sa.Column("error_code", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("error_message", sa.Text(), nullable=True))
        batch.add_column(sa.Column("created_by", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("legacy_source_id", sa.String(length=36), nullable=True))

    op.create_index("ix_work_tasks_workspace_id", "work_tasks", ["workspace_id"])
    op.create_index("ix_work_tasks_chat_run_id", "work_tasks", ["chat_run_id"])
    op.create_index("ix_work_tasks_parent_task_id", "work_tasks", ["parent_task_id"])
    op.create_index("ix_work_tasks_legacy_source_id", "work_tasks", ["legacy_source_id"])

    with op.batch_alter_table("task_runs") as batch:
        batch.add_column(sa.Column("chat_run_id", sa.String(length=36), nullable=True))
    op.create_index("ix_task_runs_chat_run_id", "task_runs", ["chat_run_id"])

    # Idempotent LocalTask → WorkTask data migration (retain LocalTask rows for read compat).
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "local_tasks" not in inspector.get_table_names():
        return

    local_rows = conn.execute(sa.text("SELECT * FROM local_tasks")).mappings().all()
    for row in local_rows:
        legacy_id = row["id"]
        existing = conn.execute(
            sa.text("SELECT id FROM work_tasks WHERE legacy_source_id = :lid LIMIT 1"),
            {"lid": legacy_id},
        ).first()
        if existing is not None:
            continue

        status = _STATUS_MAP.get(str(row.get("status") or "ready"), "ready")
        task_type = _TYPE_MAP.get(str(row.get("task_type") or "coding"), "coding")
        work_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                """
                INSERT INTO work_tasks (
                    id, source, source_task_id, assignment_id, title, description, task_type,
                    priority, status, profile_id, workspace_id, instructions, payload_json,
                    error_message, legacy_source_id, created_at, updated_at, completed_at
                ) VALUES (
                    :id, :source, :source_task_id, :assignment_id, :title, :description, :task_type,
                    :priority, :status, :profile_id, :workspace_id, :instructions, :payload_json,
                    :error_message, :legacy_source_id, :created_at, :updated_at, :completed_at
                )
                """
            ),
            {
                "id": work_id,
                "source": str(row.get("source") or "local"),
                "source_task_id": row.get("remote_task_id"),
                "assignment_id": row.get("assignment_id"),
                "title": row["title"],
                "description": row.get("description"),
                "task_type": task_type,
                "priority": int(row.get("priority") or 0),
                "status": status,
                "profile_id": row.get("target_profile_id"),
                "workspace_id": row.get("workspace_id"),
                "instructions": None,
                "payload_json": row.get("payload_json")
                or (json.dumps({"result": row.get("result_json")}) if row.get("result_json") else None),
                "error_message": row.get("error_message"),
                "legacy_source_id": legacy_id,
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "completed_at": row.get("finished_at"),
            },
        )


def downgrade() -> None:
    op.drop_index("ix_task_runs_chat_run_id", table_name="task_runs")
    with op.batch_alter_table("task_runs") as batch:
        batch.drop_column("chat_run_id")

    op.drop_index("ix_work_tasks_legacy_source_id", table_name="work_tasks")
    op.drop_index("ix_work_tasks_parent_task_id", table_name="work_tasks")
    op.drop_index("ix_work_tasks_chat_run_id", table_name="work_tasks")
    op.drop_index("ix_work_tasks_workspace_id", table_name="work_tasks")
    with op.batch_alter_table("work_tasks") as batch:
        batch.drop_column("legacy_source_id")
        batch.drop_column("created_by")
        batch.drop_column("error_message")
        batch.drop_column("error_code")
        batch.drop_column("result_summary")
        batch.drop_column("parent_task_id")
        batch.drop_column("chat_run_id")
        batch.drop_column("active_run_id")
        batch.drop_column("workspace_id")
        batch.drop_column("assigned_instance_id")
        batch.drop_column("assigned_profile_id")
        batch.drop_column("description")
