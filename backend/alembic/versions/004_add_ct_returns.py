"""add ct returns

Revision ID: 004_add_ct_returns
Revises: 003_add_einvoicing_assessments
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_add_ct_returns"
down_revision: Union[str, None] = "003_add_einvoicing_assessments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ct_returns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("tax_period_start", sa.Date(), nullable=False),
        sa.Column("tax_period_end", sa.Date(), nullable=False),
        sa.Column("accounting_profit", sa.Numeric(15, 2), nullable=True),
        sa.Column("addbacks", sa.JSON(), nullable=True),
        sa.Column("deductions", sa.JSON(), nullable=True),
        sa.Column("taxable_income", sa.Numeric(15, 2), nullable=True),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("tax_payable", sa.Numeric(15, 2), nullable=True),
        sa.Column("qfzp_eligible", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("free_zone_income", sa.Numeric(15, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ct_returns_id"), "ct_returns", ["id"], unique=False)
    op.create_index(op.f("ix_ct_returns_company_id"), "ct_returns", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ct_returns_company_id"), table_name="ct_returns")
    op.drop_index(op.f("ix_ct_returns_id"), table_name="ct_returns")
    op.drop_table("ct_returns")
