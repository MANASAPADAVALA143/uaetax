"""transaction_type, verification_history, company revenue/asp, audit_logs

Revision ID: 002_verify_dashboard
Revises: 001_initial
Create Date: 2026-04-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_verify_dashboard"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("annual_revenue_aed", sa.Float(), nullable=True))
    op.add_column(
        "companies",
        sa.Column("asp_appointed", sa.Boolean(), server_default=sa.text("false"), nullable=True),
    )

    op.add_column(
        "transactions",
        sa.Column("transaction_type", sa.String(length=20), server_default="sale", nullable=False),
    )
    op.add_column("transactions", sa.Column("verification_history", sa.JSON(), nullable=True))

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("actor", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=500), nullable=False),
        sa.Column("entity", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
    op.create_index(op.f("ix_audit_logs_company_id"), "audit_logs", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_company_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_id"), table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_column("transactions", "verification_history")
    op.drop_column("transactions", "transaction_type")

    op.drop_column("companies", "asp_appointed")
    op.drop_column("companies", "annual_revenue_aed")
