"""Add invoices table for AI invoice flow

Revision ID: 010_invoices
Revises: 009_tax_memos
Create Date: 2025-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "010_invoices"
down_revision = "009_tax_memos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("vendor_name", sa.String(255), nullable=True, index=True),
        sa.Column("vendor_trn", sa.String(50), nullable=True),
        sa.Column("invoice_number", sa.String(100), nullable=True, index=True),
        sa.Column("invoice_date", sa.String(20), nullable=True),
        sa.Column("line_items", sa.JSON(), nullable=True),
        sa.Column("subtotal_aed", sa.Float(), nullable=True),
        sa.Column("vat_amount_aed", sa.Float(), nullable=True),
        sa.Column("total_aed", sa.Float(), nullable=True),
        sa.Column("extracted_json", sa.JSON(), nullable=True),
        sa.Column("vat_treatment", sa.String(50), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("risk_flags", sa.JSON(), nullable=True),
        sa.Column("overall_risk", sa.String(20), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending", index=True),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("zoho_bill_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("invoices")
