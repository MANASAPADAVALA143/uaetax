"""Add user_companies table for Supabase auth + multi-tenancy

Revision ID: 008_user_companies
Revises: 007_add_gl_import_results
Create Date: 2025-05-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_user_companies"
down_revision: Union[str, None] = "007_add_gl_import_results"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_companies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="member"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "company_id", name="uq_user_company"),
    )
    op.create_index("ix_user_companies_id", "user_companies", ["id"], unique=False)
    op.create_index("ix_user_companies_user_id", "user_companies", ["user_id"], unique=False)
    op.create_index("ix_user_companies_company_id", "user_companies", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_companies_company_id", table_name="user_companies")
    op.drop_index("ix_user_companies_user_id", table_name="user_companies")
    op.drop_index("ix_user_companies_id", table_name="user_companies")
    op.drop_table("user_companies")
