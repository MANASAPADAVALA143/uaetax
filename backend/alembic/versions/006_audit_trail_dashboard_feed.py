"""audit trail + dashboard feed

Revision ID: 006_audit_trail_dashboard_feed
Revises: 005_add_vat_submit_tracking
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_audit_trail_dashboard_feed"
down_revision: Union[str, None] = "005_add_vat_submit_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("audit_logs"):
        cols = {c["name"] for c in inspector.get_columns("audit_logs")}
        if "entity_type" not in cols:
            op.add_column("audit_logs", sa.Column("entity_type", sa.String(length=50), nullable=True))
        if "entity_id" not in cols:
            op.add_column("audit_logs", sa.Column("entity_id", sa.Integer(), nullable=True))
        if "before_state" not in cols:
            op.add_column("audit_logs", sa.Column("before_state", sa.JSON(), nullable=True))
        if "after_state" not in cols:
            op.add_column("audit_logs", sa.Column("after_state", sa.JSON(), nullable=True))
        if "created_at" not in cols:
            op.add_column(
                "audit_logs",
                sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            )

    # Backwards-compatible alias expected by some scripts/prompts.
    # PostgreSQL does not support CREATE VIEW IF NOT EXISTS — drop first.
    op.execute("DROP VIEW IF EXISTS audit_log")
    op.execute("CREATE VIEW audit_log AS SELECT * FROM audit_logs")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS audit_log")
