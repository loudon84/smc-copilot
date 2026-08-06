"""Merge v1.6 reliable_sync and resource_apply branches.

Revision ID: 010_v16_merge_heads
Revises: 009_v16_reliable_sync, 009_v16_resource_apply
Create Date: 2026-08-06
"""

from __future__ import annotations

revision = "010_v16_merge_heads"
down_revision = ("009_v16_reliable_sync", "009_v16_resource_apply")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
