"""Chat Runtime v2 durable tables (PRD v1.1 §8.2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class ChatRun(Base):
    __tablename__ = "chat_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_run_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    instance_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    workspace_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="active")
    event_cursor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatTurn(Base):
    __tablename__ = "chat_turns"
    __table_args__ = (UniqueConstraint("run_id", "client_turn_id", name="uq_chat_turn_client"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_turn_id: Mapped[str] = mapped_column(String(128), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="pending")
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ChatEvent(Base):
    __tablename__ = "chat_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_chat_event_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    turn_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("chat_turns.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatQueueEntry(Base):
    __tablename__ = "chat_queue_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="pending")
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ChatInteraction(Base):
    __tablename__ = "chat_interactions"
    __table_args__ = (UniqueConstraint("run_id", "request_id", name="uq_chat_interaction_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    turn_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("chat_turns.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_id: Mapped[str] = mapped_column(String(128), nullable=False)
    interaction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="pending")
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
