"""Merge orphan profile_path fix branch into v1.6 experience head.

Revision ID: 014_merge_profile_path_v16
Revises: 003_fix_default_profile_path, 013_v16_experience
Create Date: 2026-08-06

``003_fix_default_profile_path`` and ``003_runtime_core`` both parent
``002_team_v18_chat``, leaving two heads. Merge so ``alembic upgrade head``
applies runtime/v1.4–v1.6 tables for installs that stopped on the profile_path fix.
"""

from __future__ import annotations

revision = "014_merge_profile_path_v16"
down_revision = ("003_fix_default_profile_path", "013_v16_experience")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
