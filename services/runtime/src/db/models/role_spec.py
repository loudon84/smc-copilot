from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class ProfileRoleSpec(Base):
    __tablename__ = "profile_role_specs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    role_key: Mapped[str] = mapped_column(String(64), nullable=False)
    role_name: Mapped[str] = mapped_column(String(128), nullable=False)
    source_repo: Mapped[str] = mapped_column(String(512), nullable=False)
    source_paths_json: Mapped[str] = mapped_column(Text, nullable=False)
    soul_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    memory_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    output_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="soul-memory-skill")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
