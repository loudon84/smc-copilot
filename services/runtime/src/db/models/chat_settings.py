from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class ProfileChatSettings(Base):
    __tablename__ = "profile_chat_settings"

    profile_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instance_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="auto")
    model_id: Mapped[str] = mapped_column(String(256), nullable=False)
    model_label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_default: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)
