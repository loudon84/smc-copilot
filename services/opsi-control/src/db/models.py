from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ActionRequestRow(Base):
    __tablename__ = "opsi_action_requests"

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aggregate_version: Mapped[int] = mapped_column(Integer, default=0)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    hermes_version: Mapped[str] = mapped_column(String(64), default="")
    config_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_repair_level: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ActionTargetRow(Base):
    __tablename__ = "opsi_action_targets"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_target_request_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_action_requests.request_id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_code: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    message: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    dispatched: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    lease_owner: Mapped[str] = mapped_column(String(128), default="")
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    property_digest: Mapped[str] = mapped_column(String(64), default="")
    opsi_action: Mapped[str] = mapped_column(String(32), default="")
    opsi_modification_time: Mapped[str] = mapped_column(String(40), default="")
    last_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_sid: Mapped[str] = mapped_column(String(184), default="")
    user_account: Mapped[str] = mapped_column(String(128), default="")


class ActionResultRow(Base):
    __tablename__ = "opsi_action_results"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_result_request_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("opsi_action_requests.request_id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    redacted: Mapped[bool] = mapped_column(Boolean, default=True)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str] = mapped_column(String(64), default="")
    body_digest: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class DiagnosticRow(Base):
    __tablename__ = "opsi_diagnostics"
    __table_args__ = (UniqueConstraint("request_id", "client_id", name="uq_opsi_diag_request_client"),)

    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    issue_code: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    recommended_action: Mapped[str] = mapped_column(String(256), nullable=False)
    files_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    manifest_digest: Mapped[str] = mapped_column(String(64), default="")


class AuditRow(Base):
    __tablename__ = "opsi_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="")
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class PollCursorRow(Base):
    __tablename__ = "opsi_poll_cursors"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cursor: Mapped[str] = mapped_column(String(128), nullable=False, default="")


class ManagedPolicyRow(Base):
    __tablename__ = "opsi_managed_policies"

    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str] = mapped_column(String(80), default="")


class WorkerHeartbeatRow(Base):
    __tablename__ = "opsi_worker_heartbeats"

    worker_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
