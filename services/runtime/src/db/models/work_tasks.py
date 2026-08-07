"""Work task execution tables (PRD v1.6 FR-401–403 + v1.3 Domain SOT)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class WorkTask(Base):
    __tablename__ = "work_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    instance_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    assigned_profile_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    assigned_instance_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    active_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    chat_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    parent_task_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approval_policy_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_policy_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_policy_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_policy_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    legacy_source_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskRun(Base):
    __tablename__ = "task_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    chat_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    hermes_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gateway_instance_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lease_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    usage_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    checkpoint_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TaskRunEvent(Base):
    __tablename__ = "task_run_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_task_run_event_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(16), default="1", nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_artifact_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    visibility: Mapped[str] = mapped_column(String(32), default="internal", nullable=False)
    redaction_status: Mapped[str] = mapped_column(String(32), default="redacted", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskRunCheckpoint(Base):
    __tablename__ = "task_run_checkpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checkpoint_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskApproval(Base):
    __tablename__ = "task_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )
    tool_call_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskArtifact(Base):
    __tablename__ = "task_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )
    artifact_type: Mapped[str] = mapped_column(String(64), nullable=False)
    local_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    upload_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    remote_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskResourceLock(Base):
    __tablename__ = "task_resource_locks"
    __table_args__ = (UniqueConstraint("resource_type", "resource_id", name="uq_task_resource_lock"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(128), nullable=False)
    lock_scope: Mapped[str] = mapped_column(String(32), default="exclusive", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="held", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskInteraction(Base):
    """Human-in-the-loop interaction requests (clarify / confirmation / missing_input)."""

    __tablename__ = "task_interactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )
    interaction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    prompt_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TaskRoutingRule(Base):
    """Persisted work-task routing rules (PRD v1.3 Phase 6)."""

    __tablename__ = "task_routing_rules"
    __table_args__ = (UniqueConstraint("task_type", name="uq_task_routing_rules_task_type"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    profile_type: Mapped[str] = mapped_column(String(64), nullable=False)
    profile_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    require_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(32), default="single_agent", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TaskExecutionQueue(Base):
    """Durable task execution queue (PRD v1.3 Phase 2)."""

    __tablename__ = "task_execution_queue"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claimed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
