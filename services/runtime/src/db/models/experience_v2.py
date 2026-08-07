"""Experience v2 models (PRD FR-1002 / FR-1003)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class ExperienceEvidenceLink(Base):
    __tablename__ = "experience_evidence_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    evidence_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("experience_evidence.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    event_sequence_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_sequence_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    artifact_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    skill_versions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_names_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExperienceFingerprint(Base):
    __tablename__ = "experience_fingerprints"
    __table_args__ = (UniqueConstraint("fingerprint", name="uq_experience_fingerprints_fingerprint"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    repeat_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    successful_reuse_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    user_confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    policy_compliance: Mapped[float | None] = mapped_column(Float, nullable=True)
    failure_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_evidence_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
