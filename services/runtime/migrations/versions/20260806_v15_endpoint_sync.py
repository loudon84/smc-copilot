"""v1.5 endpoint sync tables + migrate pending sync_outbox into delivery_outbox.

Revision ID: 008_v15_endpoint_sync
Revises: 007_v14_merge_heads
Create Date: 2026-08-06
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "008_v15_endpoint_sync"
down_revision = "007_v14_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "endpoint_enrollments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=True),
        sa.Column("tenant_id", sa.String(length=128), nullable=True),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("machine_id_hash", sa.String(length=128), nullable=True),
        sa.Column("enrollment_status", sa.String(length=32), nullable=False),
        sa.Column("enrollment_code_hint", sa.String(length=64), nullable=True),
        sa.Column("public_key_b64", sa.Text(), nullable=True),
        sa.Column("runtime_version", sa.String(length=64), nullable=True),
        sa.Column("os_version", sa.String(length=128), nullable=True),
        sa.Column("architecture", sa.String(length=64), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoint_enrollments_endpoint_id", "endpoint_enrollments", ["endpoint_id"])
    op.create_index("ix_endpoint_enrollments_enrollment_status", "endpoint_enrollments", ["enrollment_status"])

    op.create_table(
        "endpoint_credentials",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=True),
        sa.Column("public_key_b64", sa.Text(), nullable=False),
        sa.Column("private_key_storage_key", sa.String(length=256), nullable=False),
        sa.Column("refresh_credential_storage_key", sa.String(length=256), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("certificate_thumbprint", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint_id"),
    )
    op.create_index("ix_endpoint_credentials_endpoint_id", "endpoint_credentials", ["endpoint_id"])

    op.create_table(
        "sync_channels",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="idle"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel", name="uq_sync_channel_name"),
    )

    op.create_table(
        "sync_cursors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("cursor_value", sa.String(length=256), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel", name="uq_sync_cursor_channel"),
    )

    op.create_table(
        "sync_inbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=256), nullable=True),
        sa.Column("payload_hash", sa.String(length=128), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(length=128), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="received"),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", name="uq_sync_inbox_message_id"),
    )
    op.create_index("ix_sync_inbox_channel", "sync_inbox", ["channel"])
    op.create_index("ix_sync_inbox_status", "sync_inbox", ["status"])

    op.create_table(
        "delivery_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("aggregate_type", sa.String(length=64), nullable=False),
        sa.Column("aggregate_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("legacy_sync_outbox_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index("ix_delivery_outbox_channel", "delivery_outbox", ["channel"])
    op.create_index("ix_delivery_outbox_status", "delivery_outbox", ["status"])
    op.create_index("ix_delivery_outbox_event_id", "delivery_outbox", ["event_id"])

    op.create_table(
        "desired_state_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("revision", name="uq_desired_state_revision"),
    )
    op.create_index("ix_desired_state_revisions_status", "desired_state_revisions", ["status"])

    op.create_table(
        "desired_state_resources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("revision_id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("apply_mode", sa.String(length=32), nullable=False, server_default="managed"),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("artifact_url", sa.String(length=2048), nullable=True),
        sa.Column("signature", sa.Text(), nullable=True),
        sa.Column("ownership", sa.String(length=32), nullable=False, server_default="center"),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["revision_id"], ["desired_state_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_desired_state_resources_revision_id", "desired_state_resources", ["revision_id"])

    op.create_table(
        "resource_installations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("installed_version", sa.String(length=64), nullable=True),
        sa.Column("desired_version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="installed"),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("local_path", sa.String(length=1024), nullable=True),
        sa.Column("applied_revision", sa.Integer(), nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resource_type", "resource_id", name="uq_resource_installation"),
    )
    op.create_index("ix_resource_installations_status", "resource_installations", ["status"])

    op.create_table(
        "resource_conflicts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("conflict_type", sa.String(length=64), nullable=False),
        sa.Column("baseline_json", sa.Text(), nullable=True),
        sa.Column("local_json", sa.Text(), nullable=True),
        sa.Column("desired_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("resolution", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_conflicts_status", "resource_conflicts", ["status"])

    op.create_table(
        "remote_task_assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=128), nullable=False),
        sa.Column("assignment_id", sa.String(length=128), nullable=False),
        sa.Column("assignment_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("task_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("profile_ref_json", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("policies_json", sa.Text(), nullable=True),
        sa.Column("lease_seconds", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("local_task_id", sa.String(length=36), nullable=True),
        sa.Column("block_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "assignment_version", name="uq_remote_assignment_version"),
    )
    op.create_index("ix_remote_task_assignments_task_id", "remote_task_assignments", ["task_id"])
    op.create_index("ix_remote_task_assignments_assignment_id", "remote_task_assignments", ["assignment_id"])
    op.create_index("ix_remote_task_assignments_status", "remote_task_assignments", ["status"])
    op.create_index("ix_remote_task_assignments_local_task_id", "remote_task_assignments", ["local_task_id"])

    op.create_table(
        "task_leases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assignment_row_id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=128), nullable=False),
        sa.Column("lease_id", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("heartbeat_interval_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_row_id"], ["remote_task_assignments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lease_id"),
    )
    op.create_index("ix_task_leases_assignment_row_id", "task_leases", ["assignment_row_id"])
    op.create_index("ix_task_leases_assignment_id", "task_leases", ["assignment_id"])

    op.create_table(
        "task_delivery_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=128), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index("ix_task_delivery_records_assignment_id", "task_delivery_records", ["assignment_id"])
    op.create_index("ix_task_delivery_records_status", "task_delivery_records", ["status"])

    op.create_table(
        "result_artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=128), nullable=False),
        sa.Column("artifact_id", sa.String(length=128), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("local_path", sa.String(length=1024), nullable=True),
        sa.Column("upload_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("remote_url", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("artifact_id"),
    )
    op.create_index("ix_result_artifacts_assignment_id", "result_artifacts", ["assignment_id"])

    op.create_table(
        "endpoint_inventory_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoint_inventory_snapshots_endpoint_id", "endpoint_inventory_snapshots", ["endpoint_id"])

    op.create_table(
        "experience_evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=True),
        sa.Column("task_id", sa.String(length=128), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("evidence_type", sa.String(length=64), nullable=False),
        sa.Column("source_refs_json", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("redacted_payload_json", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("sensitivity", sa.String(length=32), nullable=False, server_default="internal"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experience_evidence_endpoint_id", "experience_evidence", ["endpoint_id"])
    op.create_index("ix_experience_evidence_task_id", "experience_evidence", ["task_id"])

    op.create_table(
        "experience_candidates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=128), nullable=True),
        sa.Column("candidate_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("evidence_refs_json", sa.Text(), nullable=True),
        sa.Column("scope_suggestion_json", sa.Text(), nullable=True),
        sa.Column("content_json", sa.Text(), nullable=True),
        sa.Column("sensitivity", sa.String(length=32), nullable=False, server_default="internal"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experience_candidates_endpoint_id", "experience_candidates", ["endpoint_id"])
    op.create_index("ix_experience_candidates_status", "experience_candidates", ["status"])

    op.create_table(
        "experience_submission_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("candidate_id", sa.String(length=36), nullable=False),
        sa.Column("submission_id", sa.String(length=128), nullable=True),
        sa.Column("center_status", sa.String(length=32), nullable=False, server_default="received"),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["experience_candidates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_experience_submission_records_candidate_id", "experience_submission_records", ["candidate_id"])

    # Copy pending sync_outbox rows into delivery_outbox; leave sync_outbox intact for compat.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "sync_outbox" in inspector.get_table_names():
        rows = bind.execute(
            sa.text(
                "SELECT id, target_type, target_id, event_type, payload_json, status, retry_count, last_error "
                "FROM sync_outbox WHERE status = 'pending'"
            )
        ).fetchall()
        for row in rows:
            legacy_id, target_type, target_id, event_type, payload_json, _status, retry_count, last_error = row
            bind.execute(
                sa.text(
                    "INSERT INTO delivery_outbox "
                    "(id, event_id, channel, aggregate_type, aggregate_id, event_type, payload_json, "
                    "status, attempt_count, last_error, legacy_sync_outbox_id) "
                    "VALUES (:id, :event_id, :channel, :aggregate_type, :aggregate_id, :event_type, "
                    ":payload_json, :status, :attempt_count, :last_error, :legacy_id)"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "event_id": f"legacy-{legacy_id}",
                    "channel": "task_events",
                    "aggregate_type": target_type,
                    "aggregate_id": target_id,
                    "event_type": event_type,
                    "payload_json": payload_json,
                    "status": "pending",
                    "attempt_count": int(retry_count or 0),
                    "last_error": last_error,
                    "legacy_id": legacy_id,
                },
            )


def downgrade() -> None:
    op.drop_table("experience_submission_records")
    op.drop_table("experience_candidates")
    op.drop_table("experience_evidence")
    op.drop_table("endpoint_inventory_snapshots")
    op.drop_table("result_artifacts")
    op.drop_table("task_delivery_records")
    op.drop_table("task_leases")
    op.drop_table("remote_task_assignments")
    op.drop_table("resource_conflicts")
    op.drop_table("resource_installations")
    op.drop_table("desired_state_resources")
    op.drop_table("desired_state_revisions")
    op.drop_table("delivery_outbox")
    op.drop_table("sync_inbox")
    op.drop_table("sync_cursors")
    op.drop_table("sync_channels")
    op.drop_table("endpoint_credentials")
    op.drop_table("endpoint_enrollments")
