"""v1.4 merge branched heads (bootstrap + artifact/service-update)

Revision ID: 007_v14_merge_heads
Revises: 006_v14_bootstrap_sessions, 006_v14_artifact_service_update
Create Date: 2026-08-05

Unifies the two v1.4 migration branches that diverged at
004_v14_instance_chat so ``alembic upgrade head`` resolves to a single head.
"""

from __future__ import annotations

revision = "007_v14_merge_heads"
down_revision = ("006_v14_bootstrap_sessions", "006_v14_artifact_service_update")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
