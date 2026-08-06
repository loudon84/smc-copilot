"""v1.6 work task execution tables (FR-401–507).

Revision ID: 011_v16_work_tasks
Revises: 010_v16_merge_heads
Create Date: 2026-08-06
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "011_v16_work_tasks"
down_revision = "010_v16_merge_heads"
branch_labels = None
depends_on = None

_TERMINAL_ASSIGNMENT = frozenset(
    {"delivered", "cancelled", "rejected", "completed", "failed", "expired", "delivery_failed"}
)


def upgrade() -> None:
    op.create_table(
        "work_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_task_id", sa.String(length=128), nullable=True),
        sa.Column("assignment_id", sa.String(length=128), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("task_type", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("profile_id", sa.String(length=128), nullable=True),
        sa.Column("instance_id", sa.String(length=128), nullable=True),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approval_policy_json", sa.Text(), nullable=True),
        sa.Column("workspace_policy_json", sa.Text(), nullable=True),
        sa.Column("tool_policy_json", sa.Text(), nullable=True),
        sa.Column("data_policy_json", sa.Text(), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_tasks_status", "work_tasks", ["status"])
    op.create_index("ix_work_tasks_assignment_id", "work_tasks", ["assignment_id"])
    op.create_index("ix_work_tasks_source_task_id", "work_tasks", ["source_task_id"])

    op.create_table(
        "task_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("hermes_session_id", sa.String(length=128), nullable=True),
        sa.Column("gateway_instance_id", sa.String(length=128), nullable=True),
        sa.Column("lease_id", sa.String(length=128), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_reason", sa.String(length=64), nullable=True),
        sa.Column("usage_json", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("checkpoint_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_runs_task_id", "task_runs", ["task_id"])
    op.create_index("ix_task_runs_status", "task_runs", ["status"])

    op.create_table(
        "task_run_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=16), nullable=False, server_default="1"),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("payload_artifact_id", sa.String(length=128), nullable=True),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default="internal"),
        sa.Column("redaction_status", sa.String(length=32), nullable=False, server_default="redacted"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_task_run_event_sequence"),
    )
    op.create_index("ix_task_run_events_task_id", "task_run_events", ["task_id"])
    op.create_index("ix_task_run_events_run_id", "task_run_events", ["run_id"])

    op.create_table(
        "task_run_checkpoints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("checkpoint_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_run_checkpoints_run_id", "task_run_checkpoints", ["run_id"])

    op.create_table(
        "task_approvals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("tool_call_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_approvals_task_id", "task_approvals", ["task_id"])

    op.create_table(
        "task_artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("artifact_type", sa.String(length=64), nullable=False),
        sa.Column("local_path", sa.String(length=1024), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("upload_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("remote_url", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["task_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_artifacts_task_id", "task_artifacts", ["task_id"])

    op.create_table(
        "task_resource_locks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("lock_scope", sa.String(length=64), nullable=False, server_default="exclusive"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="held"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["work_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resource_type", "resource_id", name="uq_task_resource_lock"),
    )
    op.create_index("ix_task_resource_locks_task_id", "task_resource_locks", ["task_id"])

    op.add_column(
        "remote_task_assignments",
        sa.Column("work_task_id", sa.String(length=36), nullable=True),
    )
    op.create_index("ix_remote_task_assignments_work_task_id", "remote_task_assignments", ["work_task_id"])

    op.add_column(
        "task_leases",
        sa.Column("work_task_id", sa.String(length=36), nullable=True),
    )
    op.create_index("ix_task_leases_work_task_id", "task_leases", ["work_task_id"])

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, task_id, assignment_id, task_type, title, instructions, "
            "status, profile_ref_json, policies_json, payload_json, lease_seconds, deadline "
            "FROM remote_task_assignments"
        )
    ).fetchall()
    for row in rows:
        status = row[6]
        if status in _TERMINAL_ASSIGNMENT:
            continue
        task_id = str(uuid.uuid4())
        policies = {}
        try:
            policies = json.loads(row[8] or "{}")
        except json.JSONDecodeError:
            policies = {}
        profile_ref = {}
        try:
            profile_ref = json.loads(row[7] or "{}")
        except json.JSONDecodeError:
            profile_ref = {}
        profile_id = str(profile_ref.get("resourceId") or profile_ref.get("profileId") or "")
        conn.execute(
            sa.text(
                "INSERT INTO work_tasks "
                "(id, source, source_task_id, assignment_id, title, task_type, priority, status, "
                "profile_id, instructions, approval_policy_json, workspace_policy_json, "
                "tool_policy_json, data_policy_json, payload_json, created_at, updated_at) "
                "VALUES (:id, :source, :source_task_id, :assignment_id, :title, :task_type, 0, "
                ":status, :profile_id, :instructions, :approval, :workspace, :tool, :data, "
                ":payload, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {
                "id": task_id,
                "source": "remote_assignment_migration",
                "source_task_id": row[1],
                "assignment_id": row[2],
                "title": row[4],
                "task_type": row[3],
                "status": "migration_pending_review",
                "profile_id": profile_id or None,
                "instructions": row[5],
                "approval": json.dumps(policies.get("approvalPolicy") or {}),
                "workspace": json.dumps(policies.get("workspacePolicy") or {}),
                "tool": json.dumps(policies.get("toolPolicy") or {}),
                "data": json.dumps(policies.get("dataPolicy") or {}),
                "payload": row[9],
            },
        )
        conn.execute(
            sa.text("UPDATE remote_task_assignments SET work_task_id = :wt WHERE id = :id"),
            {"wt": task_id, "id": row[0]},
        )


def downgrade() -> None:
    op.drop_index("ix_task_leases_work_task_id", table_name="task_leases")
    op.drop_column("task_leases", "work_task_id")
    op.drop_index("ix_remote_task_assignments_work_task_id", table_name="remote_task_assignments")
    op.drop_column("remote_task_assignments", "work_task_id")
    op.drop_table("task_resource_locks")
    op.drop_table("task_artifacts")
    op.drop_table("task_approvals")
    op.drop_table("task_run_checkpoints")
    op.drop_table("task_run_events")
    op.drop_table("task_runs")
    op.drop_table("work_tasks")
