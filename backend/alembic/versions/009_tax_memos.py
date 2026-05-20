"""Add tax_memos table for AI Tax Memo Generator

Revision ID: 009_tax_memos
Revises: 008_user_companies
Create Date: 2026-05-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009_tax_memos"
down_revision: Union[str, None] = "008_user_companies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tax_memos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("memo_type", sa.String(length=50), nullable=False),
        sa.Column("period", sa.String(length=20), nullable=False),
        sa.Column("memo_text", sa.Text(), nullable=False),
        sa.Column("data_snapshot_json", sa.Text(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tax_memos_id", "tax_memos", ["id"], unique=False)
    op.create_index("ix_tax_memos_company_id", "tax_memos", ["company_id"], unique=False)
    op.create_index(
        "ix_tax_memos_company_type_period",
        "tax_memos",
        ["company_id", "memo_type", "period"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tax_memos_company_type_period", table_name="tax_memos")
    op.drop_index("ix_tax_memos_company_id", table_name="tax_memos")
    op.drop_index("ix_tax_memos_id", table_name="tax_memos")
    op.drop_table("tax_memos")
