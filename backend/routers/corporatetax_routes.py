"""Corporate Tax API — spec endpoints at /api/corporatetax/*"""
from datetime import date
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Company, RelatedPartyTransaction
from services.corporate_tax_service import compute_ct, generate_ct_return_pdf, tp_check

router = APIRouter(prefix="/api/corporatetax", tags=["Corporate Tax"])

TpMethod = Literal["CUP", "TNMM", "Cost Plus", "RPM", "PSM"]
DocStatus = Literal["complete", "partial", "missing"]

DEFAULT_TP_DOCS = {
    "identification": False,
    "register_complete": False,
    "benchmarking": False,
    "masterFile": False,
    "localFile": False,
    "form17": False,
}


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


class TPTransactionCreate(BaseModel):
    party_name: str = Field(..., min_length=1, max_length=255)
    relationship: str = Field("Related party", max_length=100)
    transaction_type: str = Field("Services", max_length=100)
    amount_aed: float = Field(..., ge=0)
    arms_length_aed: Optional[float] = Field(None, ge=0)
    method: TpMethod = "TNMM"
    doc_status: DocStatus = "partial"
    notes: Optional[str] = Field(None, max_length=500)


class TPDocsUpdate(BaseModel):
    identification: bool = False
    register_complete: bool = False
    benchmarking: bool = False
    masterFile: bool = False
    localFile: bool = False
    form17: bool = False


def _serialize_tp_tx(row: RelatedPartyTransaction) -> Dict[str, Any]:
    return {
        "id": row.id,
        "party_name": row.party_name,
        "relationship": row.party_relationship,
        "transaction_type": row.transaction_type,
        "amount_aed": float(row.amount_aed or 0),
        "arms_length_aed": float(row.arms_length_aed)
        if row.arms_length_aed is not None
        else float(row.amount_aed or 0),
        "method": row.method,
        "doc_status": row.doc_status,
        "notes": row.notes,
        "created_at": row.created_at,
    }


def _register_totals(rows: List[RelatedPartyTransaction]) -> Dict[str, Any]:
    total = sum(float(r.amount_aed or 0) for r in rows)
    by_party: Dict[str, float] = {}
    for r in rows:
        by_party[r.party_name] = by_party.get(r.party_name, 0.0) + float(r.amount_aed or 0)
    largest_party = max(by_party.values()) if by_party else 0.0
    largest_party_name = max(by_party, key=by_party.get) if by_party else None
    return {
        "total_related_aed": total,
        "largest_single_party_aed": largest_party,
        "largest_party_name": largest_party_name,
        "party_totals": by_party,
        "transaction_count": len(rows),
    }


def _threshold_from_totals(totals: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate MD 97/2023 thresholds against register totals (no double-count trick)."""
    party_total = float(totals["largest_single_party_aed"] or 0)
    aggregate = float(totals["total_related_aed"] or 0)
    if totals["transaction_count"] == 0:
        return {
            "documentation_required": False,
            "flags": [],
            "recommendation": "No related-party transactions recorded yet — add entries manually.",
            "thresholds": {"per_party_aed": 3_000_000.0, "aggregate_aed": 40_000_000.0},
            "party_ytd_total_aed": 0.0,
            "aggregate_related_party_aed": 0.0,
        }
    # tp_check adds transaction_amount into totals — pass amount as full party/aggregate via ytd args
    return tp_check(
        transaction_amount=party_total if party_total > 0 else 0.01,
        party_name=totals["largest_party_name"] or "N/A",
        relationship="Register",
        party_ytd_total=0,
        all_related_party_total=max(0.0, aggregate - party_total),
    )


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
    """Check if related-party transaction requires TP documentation (MD 97/2023 thresholds)."""
    return tp_check(
        transaction_amount=body.transaction_amount,
        party_name=body.party_name,
        relationship=body.relationship,
        party_ytd_total=body.party_ytd_total,
        all_related_party_total=body.all_related_party_total,
    )


@router.get("/tp-transactions")
async def list_tp_transactions(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """List related-party transactions for the active company (manual register)."""
    rows = (
        db.query(RelatedPartyTransaction)
        .filter(RelatedPartyTransaction.company_id == company_id)
        .order_by(RelatedPartyTransaction.created_at.desc())
        .all()
    )
    totals = _register_totals(rows)
    return {
        "transactions": [_serialize_tp_tx(r) for r in rows],
        "summary": totals,
        "threshold_check": _threshold_from_totals(totals),
        "mode": "manual_register",
        "note": (
            "Related-party transactions are manually maintained. "
            "Auto-detection from invoices is not available yet."
        ),
    }


@router.post("/tp-transactions")
async def create_tp_transaction(
    body: TPTransactionCreate,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Add a related-party transaction to the company register."""
    arms = body.arms_length_aed if body.arms_length_aed is not None else body.amount_aed
    row = RelatedPartyTransaction(
        company_id=company_id,
        party_name=body.party_name.strip(),
        party_relationship=body.relationship.strip() or "Related party",
        transaction_type=body.transaction_type.strip() or "Services",
        amount_aed=body.amount_aed,
        arms_length_aed=arms,
        method=body.method,
        doc_status=body.doc_status,
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    others = (
        db.query(RelatedPartyTransaction)
        .filter(
            RelatedPartyTransaction.company_id == company_id,
            RelatedPartyTransaction.id != row.id,
        )
        .all()
    )
    party_ytd = sum(float(r.amount_aed or 0) for r in others if r.party_name == row.party_name)
    aggregate = sum(float(r.amount_aed or 0) for r in others)
    check = tp_check(
        transaction_amount=float(row.amount_aed or 0),
        party_name=row.party_name,
        relationship=row.party_relationship,
        party_ytd_total=party_ytd,
        all_related_party_total=aggregate,
    )

    return {
        "transaction": _serialize_tp_tx(row),
        "threshold_check": check,
    }


@router.delete("/tp-transactions/{transaction_id}")
async def delete_tp_transaction(
    transaction_id: int,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Delete a related-party transaction from the company register."""
    row = (
        db.query(RelatedPartyTransaction)
        .filter(
            RelatedPartyTransaction.id == transaction_id,
            RelatedPartyTransaction.company_id == company_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": transaction_id}


@router.get("/tp-docs")
async def get_tp_docs(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """TP documentation checklist stored on company.settings."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    settings = company.settings if isinstance(company.settings, dict) else {}
    stored = dict(settings.get("tp_documentation") or {})
    # Migrate legacy key from earlier UI
    if "register" in stored and "register_complete" not in stored:
        stored["register_complete"] = bool(stored.pop("register"))
    docs = {**DEFAULT_TP_DOCS, **stored}
    return {"docs": docs}


@router.put("/tp-docs")
async def update_tp_docs(
    body: TPDocsUpdate,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Update TP documentation checklist on company.settings."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    settings = dict(company.settings) if isinstance(company.settings, dict) else {}
    settings["tp_documentation"] = body.model_dump()
    company.settings = settings
    db.commit()
    return {"docs": settings["tp_documentation"]}
