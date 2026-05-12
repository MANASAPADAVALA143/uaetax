"""add vat return submit tracking

Revision ID: 005_add_vat_submit_tracking
Revises: 004_add_ct_returns
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_add_vat_submit_tracking"
down_revision: Union[str, None] = "004_add_ct_returns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    vat_return_columns = {c["name"] for c in inspector.get_columns("vat_returns")}
    if "submission_status" not in vat_return_columns:
        op.add_column(
            "vat_returns",
            sa.Column("submission_status", sa.String(length=50), nullable=False, server_default="not_submitted"),
        )
    if "submitted_at" not in vat_return_columns:
        op.add_column("vat_returns", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    if "fta_reference_number" not in vat_return_columns:
        op.add_column("vat_returns", sa.Column("fta_reference_number", sa.String(length=255), nullable=True))
    if "submission_error" not in vat_return_columns:
        op.add_column("vat_returns", sa.Column("submission_error", sa.String(length=500), nullable=True))

    if not inspector.has_table("fta_submission_log"):
        op.create_table(
            "fta_submission_log",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("vat_return_id", sa.Integer(), nullable=False),
            sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("submission_status", sa.String(length=50), nullable=False),
            sa.Column("payload_snapshot", sa.JSON(), nullable=False),
            sa.Column("response_raw", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["vat_return_id"], ["vat_returns.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("fta_submission_log")}
    if op.f("ix_fta_submission_log_id") not in existing_indexes:
        op.create_index(op.f("ix_fta_submission_log_id"), "fta_submission_log", ["id"], unique=False)
    if op.f("ix_fta_submission_log_vat_return_id") not in existing_indexes:
        op.create_index(
            op.f("ix_fta_submission_log_vat_return_id"),
            "fta_submission_log",
            ["vat_return_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_fta_submission_log_vat_return_id"), table_name="fta_submission_log")
    op.drop_index(op.f("ix_fta_submission_log_id"), table_name="fta_submission_log")
    op.drop_table("fta_submission_log")

    op.drop_column("vat_returns", "submission_error")
    op.drop_column("vat_returns", "fta_reference_number")
    op.drop_column("vat_returns", "submitted_at")
    op.drop_column("vat_returns", "submission_status")
