"""Add Hermes Runtime Service tables

Revision ID: 003_runtime_core
Revises: 002_team_v18_chat
Create Date: 2026-07-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003_runtime_core"
down_revision = "002_team_v18_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runtime_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("install_path", sa.String(length=1024), nullable=False),
        sa.Column("executable_path", sa.String(length=1024), nullable=False),
        sa.Column("python_path", sa.String(length=1024), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version"),
    )
    op.create_index("ix_runtime_versions_version", "runtime_versions", ["version"])
    op.create_index("ix_runtime_versions_status", "runtime_versions", ["status"])

    op.create_table(
        "runtime_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("phase", sa.String(length=64), nullable=True),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("request_json", sa.Text(), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by_device_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_runtime_jobs_job_type", "runtime_jobs", ["job_type"])
    op.create_index("ix_runtime_jobs_status", "runtime_jobs", ["status"])

    op.create_table(
        "runtime_job_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_runtime_job_events_job_id", "runtime_job_events", ["job_id"])

    op.create_table(
        "instances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("profile_name", sa.String(length=128), nullable=False),
        sa.Column("runtime_version_id", sa.String(length=36), nullable=True),
        sa.Column("gateway_port", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("healthy", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("auto_start", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pid", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_instances_runtime_version_id", "instances", ["runtime_version_id"])
    op.create_index("ix_instances_status", "instances", ["status"])

    op.create_table(
        "config_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("instance_id", sa.String(length=36), nullable=False),
        sa.Column("reason", sa.String(length=128), nullable=False),
        sa.Column("runtime_version", sa.String(length=64), nullable=True),
        sa.Column("snapshot_path", sa.String(length=1024), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_config_snapshots_instance_id", "config_snapshots", ["instance_id"])

    op.create_table(
        "device_pairings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("challenge_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_pairings_status", "device_pairings", ["status"])

    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_devices_status", "devices", ["status"])

    op.create_table(
        "secret_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope_type", sa.String(length=64), nullable=False),
        sa.Column("scope_id", sa.String(length=128), nullable=False),
        sa.Column("secret_name", sa.String(length=128), nullable=False),
        sa.Column("storage_provider", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_secret_references_scope_type", "secret_references", ["scope_type"])
    op.create_index("ix_secret_references_scope_id", "secret_references", ["scope_id"])

    op.create_table(
        "runtime_audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("device_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=True),
        sa.Column("result", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_runtime_audit_logs_device_id", "runtime_audit_logs", ["device_id"])

    # Data migration: profiles -> instances (preserve id and gateway_port)
    conn = op.get_bind()
    profiles = conn.execute(
        sa.text(
            "SELECT id, name, gateway_port, auto_start, status, gateway_pid FROM profiles"
        )
    ).fetchall()
    for row in profiles:
        status = row[4] or "stopped"
        if status == "error":
            status = "failed"
        elif status not in (
            "created",
            "stopped",
            "starting",
            "running",
            "degraded",
            "stopping",
            "restarting",
            "failed",
        ):
            status = "stopped"
        conn.execute(
            sa.text(
                "INSERT INTO instances "
                "(id, name, profile_name, runtime_version_id, gateway_port, status, healthy, auto_start, pid) "
                "VALUES (:id, :name, :profile_name, NULL, :gateway_port, :status, 0, :auto_start, :pid)"
            ),
            {
                "id": row[0],
                "name": row[1],
                "profile_name": row[1],
                "gateway_port": row[2],
                "status": status,
                "auto_start": 1 if row[3] else 0,
                "pid": row[5],
            },
        )


def downgrade() -> None:
    op.drop_table("runtime_audit_logs")
    op.drop_table("secret_references")
    op.drop_table("devices")
    op.drop_table("device_pairings")
    op.drop_table("config_snapshots")
    op.drop_table("instances")
    op.drop_table("runtime_job_events")
    op.drop_table("runtime_jobs")
    op.drop_table("runtime_versions")
