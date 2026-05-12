"""Initial migration for GulfTax AI models

Revision ID: 001_initial
Revises: 
Create Date: 2025-01-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create companies table
    op.create_table(
        'companies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('trade_license_number', sa.String(length=100), nullable=True),
        sa.Column('trn', sa.String(length=50), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('free_zone_name', sa.String(length=255), nullable=True),
        sa.Column('is_qfzp', sa.Boolean(), nullable=True),
        sa.Column('vat_registered', sa.Boolean(), nullable=True),
        sa.Column('ct_registered', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_companies_id'), 'companies', ['id'], unique=False)
    op.create_index(op.f('ix_companies_name'), 'companies', ['name'], unique=False)
    op.create_index(op.f('ix_companies_trade_license_number'), 'companies', ['trade_license_number'], unique=True)
    op.create_index(op.f('ix_companies_trn'), 'companies', ['trn'], unique=True)

    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('amount_aed', sa.Float(), nullable=False),
        sa.Column('vendor_or_customer', sa.String(length=255), nullable=True),
        sa.Column('invoice_number', sa.String(length=100), nullable=True),
        sa.Column('vat_treatment', sa.String(length=50), nullable=True),
        sa.Column('vat_amount_aed', sa.Float(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('ai_reasoning', sa.Text(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_transactions_id'), 'transactions', ['id'], unique=False)
    op.create_index(op.f('ix_transactions_company_id'), 'transactions', ['company_id'], unique=False)
    op.create_index(op.f('ix_transactions_date'), 'transactions', ['date'], unique=False)

    # Create vat_returns table
    op.create_table(
        'vat_returns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('box1_standard_rated_supplies', sa.Float(), nullable=True),
        sa.Column('box2_vat_on_supplies', sa.Float(), nullable=True),
        sa.Column('box3_zero_rated_supplies', sa.Float(), nullable=True),
        sa.Column('box4_exempt_supplies', sa.Float(), nullable=True),
        sa.Column('box5_total_taxable_supplies', sa.Float(), nullable=True),
        sa.Column('box6_taxable_expenses', sa.Float(), nullable=True),
        sa.Column('box7_vat_on_expenses', sa.Float(), nullable=True),
        sa.Column('box8_vat_payable_or_refundable', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vat_returns_id'), 'vat_returns', ['id'], unique=False)
    op.create_index(op.f('ix_vat_returns_company_id'), 'vat_returns', ['company_id'], unique=False)

    # Create reconciliation_results table
    op.create_table(
        'reconciliation_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('vat_return_id', sa.Integer(), nullable=True),
        sa.Column('total_invoices_aed', sa.Float(), nullable=True),
        sa.Column('total_output_vat_aed', sa.Float(), nullable=True),
        sa.Column('vat_return_output_aed', sa.Float(), nullable=True),
        sa.Column('difference_aed', sa.Float(), nullable=True),
        sa.Column('mismatches', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['vat_return_id'], ['vat_returns.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reconciliation_results_id'), 'reconciliation_results', ['id'], unique=False)
    op.create_index(op.f('ix_reconciliation_results_company_id'), 'reconciliation_results', ['company_id'], unique=False)
    op.create_index(op.f('ix_reconciliation_results_vat_return_id'), 'reconciliation_results', ['vat_return_id'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_reconciliation_results_vat_return_id'), table_name='reconciliation_results')
    op.drop_index(op.f('ix_reconciliation_results_company_id'), table_name='reconciliation_results')
    op.drop_index(op.f('ix_reconciliation_results_id'), table_name='reconciliation_results')
    op.drop_table('reconciliation_results')

    op.drop_index(op.f('ix_vat_returns_company_id'), table_name='vat_returns')
    op.drop_index(op.f('ix_vat_returns_id'), table_name='vat_returns')
    op.drop_table('vat_returns')

    op.drop_index(op.f('ix_transactions_date'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_company_id'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_id'), table_name='transactions')
    op.drop_table('transactions')

    op.drop_index(op.f('ix_companies_trn'), table_name='companies')
    op.drop_index(op.f('ix_companies_trade_license_number'), table_name='companies')
    op.drop_index(op.f('ix_companies_name'), table_name='companies')
    op.drop_index(op.f('ix_companies_id'), table_name='companies')
    op.drop_table('companies')
