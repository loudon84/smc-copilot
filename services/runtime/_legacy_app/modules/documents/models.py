from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[str] = mapped_column(String(32), nullable=False)
    engine: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")

    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    current_version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

    versions: Mapped[list["DocumentVersion"]] = relationship(back_populates="document")

    __table_args__ = (
        CheckConstraint("document_type IN ('spreadsheet')", name="chk_documents_type"),
        CheckConstraint("engine IN ('univer')", name="chk_documents_engine"),
        CheckConstraint("status IN ('draft', 'active', 'archived', 'deleted')", name="chk_documents_status"),
        CheckConstraint("provider IN ('local', 'wecom', 'onlyoffice')", name="chk_documents_provider"),
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)

    version_no: Mapped[int] = mapped_column(Integer, nullable=False)

    snapshot_bucket: Mapped[str] = mapped_column(String(128), nullable=False)
    snapshot_key: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    snapshot_checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    engine: Mapped[str] = mapped_column(String(32), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    save_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Optional AI lineage (manual saves leave NULL)
    created_from: Mapped[str | None] = mapped_column(String(32), nullable=True)
    related_interaction_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    related_patch_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    document: Mapped[Document] = relationship(back_populates="versions")

    __table_args__ = (
        CheckConstraint("engine IN ('univer')", name="chk_document_versions_engine"),
        CheckConstraint("save_mode IN ('manual', 'autosave', 'system')", name="chk_document_versions_save_mode"),
        CheckConstraint(
            "created_from IS NULL OR created_from IN ('manual_save', 'ai_patch_apply')",
            name="chk_document_versions_created_from",
        ),
    )


class DocumentPermission(Base):
    __tablename__ = "document_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)

    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint("subject_type IN ('user', 'role', 'department')", name="chk_document_permission_subject"),
        CheckConstraint("role IN ('view', 'edit', 'owner')", name="chk_document_permission_role"),
    )


class DocumentEvent(Base):
    __tablename__ = "document_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)

    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
