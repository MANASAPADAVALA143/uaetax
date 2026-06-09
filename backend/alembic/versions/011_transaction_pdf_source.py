"""Add PDF invoice source columns to transactions

Revision ID: 011_transaction_pdf_source
Revises: 010_invoices
Create Date: 2026-06-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011_transaction_pdf_source"
down_revision: Union[str, None] = "010_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("source_file_name", sa.String(length=255), nullable=True))
    op.add_column("transactions", sa.Column("source_metadata", sa.JSON(), nullable=True))
    op.add_column("transactions", sa.Column("vendor_trn", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "vendor_trn")
    op.drop_column("transactions", "source_metadata")
    op.drop_column("transactions", "source_file_name")
