"""v1.4 MCP server tables

Revision ID: 005_v14_mcp_tables
Revises: 004_v14_instance_chat
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "005_v14_mcp_tables"
down_revision = "004_v14_instance_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("instance_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("transport", sa.String(length=32), nullable=False),
        sa.Column("command", sa.String(length=1024), nullable=True),
        sa.Column("args_json", sa.Text(), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_servers_instance_id", "mcp_servers", ["instance_id"])
    op.create_index("ix_mcp_servers_status", "mcp_servers", ["status"])

    op.create_table(
        "mcp_secret_refs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mcp_server_id", sa.String(length=36), nullable=False),
        sa.Column("secret_name", sa.String(length=128), nullable=False),
        sa.Column("secret_reference_id", sa.String(length=36), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_secret_refs_mcp_server_id", "mcp_secret_refs", ["mcp_server_id"])
    op.create_index("ix_mcp_secret_refs_secret_reference_id", "mcp_secret_refs", ["secret_reference_id"])

    op.create_table(
        "mcp_test_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mcp_server_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("tested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_test_results_mcp_server_id", "mcp_test_results", ["mcp_server_id"])


def downgrade() -> None:
    op.drop_index("ix_mcp_test_results_mcp_server_id", table_name="mcp_test_results")
    op.drop_table("mcp_test_results")
    op.drop_index("ix_mcp_secret_refs_secret_reference_id", table_name="mcp_secret_refs")
    op.drop_index("ix_mcp_secret_refs_mcp_server_id", table_name="mcp_secret_refs")
    op.drop_table("mcp_secret_refs")
    op.drop_index("ix_mcp_servers_status", table_name="mcp_servers")
    op.drop_index("ix_mcp_servers_instance_id", table_name="mcp_servers")
    op.drop_table("mcp_servers")
