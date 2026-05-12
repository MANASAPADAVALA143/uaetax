"""add einvoicing assessments

Revision ID: 003_add_einvoicing_assessments
Revises: 002_verify_dashboard
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_add_einvoicing_assessments"
down_revision: Union[str, None] = "002_verify_dashboard"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "einvoicing_assessments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("readiness_level", sa.String(length=20), nullable=True),
        sa.Column("gap_areas", sa.JSON(), nullable=True),
        sa.Column("recommendations", sa.JSON(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_einvoicing_assessments_id"),
        "einvoicing_assessments",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_einvoicing_assessments_company_id"),
        "einvoicing_assessments",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_einvoicing_assessments_assessed_at"),
        "einvoicing_assessments",
        ["assessed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_einvoicing_assessments_assessed_at"),
        table_name="einvoicing_assessments",
    )
    op.drop_index(
        op.f("ix_einvoicing_assessments_company_id"),
        table_name="einvoicing_assessments",
    )
    op.drop_index(
        op.f("ix_einvoicing_assessments_id"),
        table_name="einvoicing_assessments",
    )
    op.drop_table("einvoicing_assessments")
