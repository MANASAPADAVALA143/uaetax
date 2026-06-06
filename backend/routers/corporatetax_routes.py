"""Corporate Tax API — spec endpoints at /api/corporatetax/*"""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Company
from services.corporate_tax_service import compute_ct, generate_ct_return_pdf, tp_check

router = APIRouter(prefix="/api/corporatetax", tags=["Corporate Tax"])


class ComputeCTRequest(BaseModel):
    accounting_profit: float
    free_zone_status: Literal["mainland", "free_zone_qfzp", "free_zone_non_qfzp"] = "mainland"
    revenue: float = Field(..., ge=0)
    related_party_transactions: float = Field(0, ge=0)
    exempt_income: float = Field(0, ge=0)
    non_deductible_expenses: float = Field(0, ge=0)
    qualifying_income: Optional[float] = None
    small_business_relief: bool = False


class GenerateReturnRequest(BaseModel):
    tax_period_start: date
    tax_period_end: date
    revenue: float = Field(..., ge=0)
    taxable_income: float = Field(..., ge=0)
    exemptions_claimed: float = Field(0, ge=0)
    ct_payable: float = Field(..., ge=0)


class TPCheckRequest(BaseModel):
    transaction_amount: float = Field(..., gt=0)
    party_name: str
    relationship: str
    party_ytd_total: float = Field(0, ge=0)
    all_related_party_total: float = Field(0, ge=0)


@router.post("/compute")
async def api_compute_ct(
    body: ComputeCTRequest,
    company_id: int = Depends(get_current_company_id),
):
    """Compute CT liability with mainland, QFZP, and Small Business Relief rules."""
    return compute_ct(
        accounting_profit=body.accounting_profit,
        free_zone_status=body.free_zone_status,
        revenue=body.revenue,
        related_party_transactions=body.related_party_transactions,
        exempt_income=body.exempt_income,
        non_deductible_expenses=body.non_deductible_expenses,
        qualifying_income=body.qualifying_income,
        small_business_relief=body.small_business_relief,
    )


@router.post("/generate-return")
async def api_generate_return(
    body: GenerateReturnRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Generate FTA-format CT return draft as PDF."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    pdf_bytes = generate_ct_return_pdf(
        company_name=company.name,
        trn=company.trn,
        tax_period_start=body.tax_period_start,
        tax_period_end=body.tax_period_end,
        revenue=body.revenue,
        taxable_income=body.taxable_income,
        exemptions_claimed=body.exemptions_claimed,
        ct_payable=body.ct_payable,
    )
    filename = f"ct_return_{body.tax_period_end.year}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/tp-check")
async def api_tp_check(
    body: TPCheckRequest,
    company_id: int = Depends(get_current_company_id),
):
    """Check if related-party transaction requires TP documentation."""
    return tp_check(
        transaction_amount=body.transaction_amount,
        party_name=body.party_name,
        relationship=body.relationship,
        party_ytd_total=body.party_ytd_total,
        all_related_party_total=body.all_related_party_total,
    )
