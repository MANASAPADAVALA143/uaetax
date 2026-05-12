"""add gl import results

Revision ID: 007_add_gl_import_results
Revises: 006_audit_trail_dashboard_feed
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_add_gl_import_results"
down_revision: Union[str, None] = "006_audit_trail_dashboard_feed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gl_import_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("parse_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=True),
        sa.Column("standard_rated", sa.Integer(), nullable=True),
        sa.Column("zero_rated", sa.Integer(), nullable=True),
        sa.Column("exempt", sa.Integer(), nullable=True),
        sa.Column("reverse_charge", sa.Integer(), nullable=True),
        sa.Column("out_of_scope", sa.Integer(), nullable=True),
        sa.Column("needs_review", sa.Integer(), nullable=True),
        sa.Column("est_vat_on_sales_aed", sa.Integer(), nullable=True),
        sa.Column("est_input_tax_aed", sa.Integer(), nullable=True),
        sa.Column("rc_vat_aed", sa.Integer(), nullable=True),
        sa.Column("estimated_box8_aed", sa.Integer(), nullable=True),
        sa.Column("parsed_rows", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_gl_import_results_id"), "gl_import_results", ["id"], unique=False)
    op.create_index(op.f("ix_gl_import_results_company_id"), "gl_import_results", ["company_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_gl_import_results_company_id"), table_name="gl_import_results")
    op.drop_index(op.f("ix_gl_import_results_id"), table_name="gl_import_results")
    op.drop_table("gl_import_results")
