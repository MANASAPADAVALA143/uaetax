"""Corporate Tax calculation and advisory endpoints."""
import hashlib
import hmac
import json
import os
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from sqlalchemy import and_, func as sa_func
from database import get_db
from middleware.auth import get_current_company_id
from models import CTReturn, Transaction

load_dotenv()

router = APIRouter()

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
claude_client = Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None

CT_ZERO_BAND = Decimal("375000")
CT_RATE = Decimal("0.09")


class CTLineItem(BaseModel):
    label: str
    amount: float


class CalculateCTRequest(BaseModel):
    company_id: int
    tax_period_start: date
    tax_period_end: date
    accounting_profit: float
    addbacks: List[CTLineItem] = Field(default_factory=list)
    deductions: List[CTLineItem] = Field(default_factory=list)
    free_zone_income: float = 0
    qfzp_eligible: bool = False


class SuggestAddbacksRequest(BaseModel):
    company_id: int
    trial_balance_items: List[Dict[str, Any]]


def _as_decimal(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _json_from_claude_text(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```", 1)[1].split("```", 1)[0].strip()
    return json.loads(cleaned)


@router.post("/calculate")
async def calculate_ct(
    request: CalculateCTRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    total_addbacks = sum(_as_decimal(item.amount) for item in request.addbacks)
    total_deductions = sum(_as_decimal(item.amount) for item in request.deductions)
    accounting_profit = _as_decimal(request.accounting_profit)
    taxable_income = accounting_profit + total_addbacks - total_deductions

    if taxable_income < 0:
        taxable_income = Decimal("0.00")

    if request.qfzp_eligible:
        qualifying_income = min(_as_decimal(request.free_zone_income), taxable_income)
        remaining = max(Decimal("0.00"), taxable_income - qualifying_income)
    else:
        qualifying_income = Decimal("0.00")
        remaining = taxable_income

    if remaining <= CT_ZERO_BAND:
        tax_payable = Decimal("0.00")
    else:
        tax_payable = (remaining - CT_ZERO_BAND) * CT_RATE

    tax_payable = tax_payable.quantize(Decimal("0.01"))
    tax_rate = (
        ((tax_payable / taxable_income) * Decimal("100")).quantize(Decimal("0.01"))
        if taxable_income > 0
        else Decimal("0.00")
    )

    ct_return = CTReturn(
        company_id=company_id,
        tax_period_start=request.tax_period_start,
        tax_period_end=request.tax_period_end,
        accounting_profit=accounting_profit,
        addbacks=[item.model_dump() for item in request.addbacks],
        deductions=[item.model_dump() for item in request.deductions],
        taxable_income=taxable_income,
        tax_rate=tax_rate,
        tax_payable=tax_payable,
        qfzp_eligible=request.qfzp_eligible,
        free_zone_income=_as_decimal(request.free_zone_income),
        status="draft",
    )
    db.add(ct_return)
    db.commit()
    db.refresh(ct_return)

    return {
        "id": ct_return.id,
        "company_id": ct_return.company_id,
        "tax_period_start": ct_return.tax_period_start,
        "tax_period_end": ct_return.tax_period_end,
        "accounting_profit": float(ct_return.accounting_profit or 0),
        "addbacks": ct_return.addbacks or [],
        "deductions": ct_return.deductions or [],
        "taxable_income": float(ct_return.taxable_income or 0),
        "tax_rate": float(ct_return.tax_rate or 0),
        "tax_payable": float(ct_return.tax_payable or 0),
        "qfzp_eligible": ct_return.qfzp_eligible,
        "free_zone_income": float(ct_return.free_zone_income or 0),
        "status": ct_return.status,
        "created_at": ct_return.created_at,
        "meta": {
            "qualifying_income_zero_rated": float(qualifying_income),
            "remaining_taxable_at_standard_rate": float(remaining),
            "threshold_aed": float(CT_ZERO_BAND),
            "standard_rate_percent": 9,
        },
    }


@router.get("/returns")
async def list_ct_returns(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CTReturn)
        .filter(CTReturn.company_id == company_id)
        .order_by(CTReturn.tax_period_start.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "company_id": row.company_id,
            "tax_period_start": row.tax_period_start,
            "tax_period_end": row.tax_period_end,
            "taxable_income": float(row.taxable_income or 0),
            "tax_payable": float(row.tax_payable or 0),
            "tax_rate": float(row.tax_rate or 0),
            "qfzp_eligible": row.qfzp_eligible,
            "status": row.status,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/from-transactions")
async def ct_from_transactions(
    period_start: date = Query(...),
    period_end: date = Query(...),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Auto-compute accounting profit from VAT Classifier transaction data."""
    txns = db.query(Transaction).filter(
        and_(
            Transaction.company_id == company_id,
            Transaction.date >= period_start,
            Transaction.date <= period_end,
        )
    ).all()

    revenue = sum(t.amount_aed for t in txns if t.transaction_type == "sale")
    expenses = sum(t.amount_aed for t in txns if t.transaction_type == "purchase")
    accounting_profit = revenue - expenses

    # Breakdown by VAT treatment for addback suggestions
    exempt_expenses = sum(
        t.amount_aed for t in txns
        if t.transaction_type == "purchase" and t.vat_treatment in ("exempt", "out_of_scope")
    )
    entertainment_est = sum(
        t.amount_aed for t in txns
        if t.transaction_type == "purchase"
        and any(kw in (t.description or "").lower() for kw in [
            "entertainment", "restaurant", "hotel", "meals", "hospitality",
            "leisure", "recreation", "food", "beverage", "nobu", "hilton"
        ])
    )

    suggested_addbacks = []
    if entertainment_est > 0:
        suggested_addbacks.append({
            "label": "Entertainment & hospitality (non-deductible)",
            "amount": round(entertainment_est, 2),
            "reason": "Article 33, UAE CT Law — entertainment expenses disallowed"
        })

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "transaction_count": len(txns),
        "revenue_aed": round(revenue, 2),
        "expenses_aed": round(expenses, 2),
        "accounting_profit_aed": round(accounting_profit, 2),
        "suggested_addbacks": suggested_addbacks,
        "breakdown": {
            "sales_standard_rated": round(sum(t.amount_aed for t in txns if t.transaction_type == "sale" and t.vat_treatment == "standard_rated"), 2),
            "sales_zero_rated": round(sum(t.amount_aed for t in txns if t.transaction_type == "sale" and t.vat_treatment == "zero_rated"), 2),
            "sales_exempt": round(sum(t.amount_aed for t in txns if t.transaction_type == "sale" and t.vat_treatment == "exempt"), 2),
            "purchases_total": round(expenses, 2),
            "purchases_entertainment": round(entertainment_est, 2),
        },
    }


@router.get("/returns/{return_id}")
async def get_ct_return(
    return_id: int,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    row = db.query(CTReturn).filter(
        CTReturn.id == return_id, CTReturn.company_id == company_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="CT return not found")
    return {
        "id": row.id,
        "company_id": row.company_id,
        "tax_period_start": row.tax_period_start,
        "tax_period_end": row.tax_period_end,
        "accounting_profit": float(row.accounting_profit or 0),
        "addbacks": row.addbacks or [],
        "deductions": row.deductions or [],
        "taxable_income": float(row.taxable_income or 0),
        "tax_rate": float(row.tax_rate or 0),
        "tax_payable": float(row.tax_payable or 0),
        "qfzp_eligible": row.qfzp_eligible,
        "free_zone_income": float(row.free_zone_income or 0),
        "status": row.status,
        "created_at": row.created_at,
    }


class NarrativeRequest(BaseModel):
    accounting_profit: float
    taxable_income: float
    ct_liability: float
    entity_type: str = "mainland"
    addbacks: List[CTLineItem] = Field(default_factory=list)
    deductions: List[CTLineItem] = Field(default_factory=list)
    sbr_elected: bool = False
    filing_deadline: Optional[str] = None


@router.post("/narrative")
async def generate_narrative(
    payload: NarrativeRequest,
    _company_id: int = Depends(get_current_company_id),
):
    """Generate AI CT advisory narrative for CFO."""
    if claude_client is None:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured.",
        )

    add_lines = "\n".join(f"  - {a.label}: AED {a.amount:,.0f}" for a in payload.addbacks if a.amount)
    ded_lines = "\n".join(f"  - {d.label}: AED {d.amount:,.0f}" for d in payload.deductions if d.amount)
    entity_label = {
        "mainland": "Mainland taxable person",
        "free_zone_qfzp": "Qualifying Free Zone Person (QFZP)",
        "free_zone_other": "Free Zone — non-qualifying",
    }.get(payload.entity_type, payload.entity_type)

    prompt = f"""You are a senior UAE Corporate Tax advisor writing a concise advisory note for a CFO.

Entity type: {entity_label}
Accounting profit: AED {payload.accounting_profit:,.0f}
Add-backs (non-deductible items):{chr(10) + add_lines if add_lines else " None"}
Deductions / reliefs:{chr(10) + ded_lines if ded_lines else " None"}
Taxable income: AED {payload.taxable_income:,.0f}
Estimated CT liability: AED {payload.ct_liability:,.0f}
Small Business Relief elected: {"Yes" if payload.sbr_elected else "No"}
Filing deadline: {payload.filing_deadline or "9 months after fiscal year end"}

Write exactly 3 paragraphs (no headings, no bullet points, plain prose):
1. What drove the CT liability — key factors, add-backs, and their UAE CT Law basis (Federal Decree-Law No. 47 of 2022)
2. Key deductions and reliefs to review before filing — specific opportunities relevant to this entity
3. Filing obligations, deadline, and recommended next steps

Write in a professional but clear tone. Do not use markdown formatting."""

    try:
        msg = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=700,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}],
        )
        return {"narrative": msg.content[0].text.strip()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude narrative failed: {exc}") from exc


@router.post("/suggest-addbacks")
async def suggest_addbacks(
    payload: SuggestAddbacksRequest,
    _company_id: int = Depends(get_current_company_id),
):
    if claude_client is None:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to backend/.env to use AI suggestions.",
        )

    system_prompt = (
        "You are a UAE Corporate Tax expert. Given trial balance line items, identify non-deductible "
        "expenses under UAE CT Law Federal Decree-Law No. 47 of 2022. Respond with JSON only, no preamble: "
        "{ addbacks: [{label: string, amount: number, reason: string}] }"
    )
    user_prompt = json.dumps(payload.trial_balance_items, ensure_ascii=True)

    try:
        message = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            temperature=0.2,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        body = _json_from_claude_text(message.content[0].text)
        addbacks = body.get("addbacks", [])
        if not isinstance(addbacks, list):
            addbacks = []
        return {"company_id": payload.company_id, "addbacks": addbacks}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Invalid JSON returned by Claude: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude suggestion failed: {exc}") from exc


# ── n8n CT Filing inbound webhook ─────────────────────────────────────────────

class CTAssessmentInbound(BaseModel):
    company_id: int
    tax_year: str
    taxable_income: float
    ct_payable: float
    addbacks: Dict[str, Any] = Field(default_factory=dict)
    deductions: Dict[str, Any] = Field(default_factory=dict)
    analysis: str = ""
    urgency_level: Optional[str] = None
    days_to_deadline: Optional[int] = None
    checklist_completion_pct: Optional[int] = None


def _verify_n8n_sig(secret: str, body: bytes, received: str) -> bool:
    if not received or not received.strip():
        return False
    received = received.strip()
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, received.lower()):
        return True
    return secrets.compare_digest(received, secret)


@router.post("/n8n/inbound/ct_assessed")
async def inbound_ct_assessed(
    request: Request,
    db: Session = Depends(get_db),
    x_n8n_signature: Optional[str] = Header(default=None, alias="X-N8N-Signature"),
):
    """Receive CT filing prep results from n8n workflow and store in DB."""
    secret = os.getenv("N8N_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="N8N_WEBHOOK_SECRET not configured")
    if not x_n8n_signature:
        raise HTTPException(status_code=401, detail="Missing X-N8N-Signature")

    raw_body = await request.body()
    if not _verify_n8n_sig(secret, raw_body, x_n8n_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = CTAssessmentInbound.model_validate_json(raw_body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {exc}") from exc

    # Store as a CTReturn row (reuse existing model)
    ct_row = CTReturn(
        company_id=payload.company_id,
        tax_period_start=date(int(payload.tax_year[:4]), 1, 1),
        tax_period_end=date(int(payload.tax_year[:4]), 12, 31),
        accounting_profit=payload.taxable_income,
        total_addbacks=sum(payload.addbacks.values()) if isinstance(payload.addbacks, dict) else 0,
        total_deductions=sum(payload.deductions.values()) if isinstance(payload.deductions, dict) else 0,
        taxable_income=payload.taxable_income,
        ct_payable=payload.ct_payable,
        ai_advisory=payload.analysis,
        status="assessed",
    )
    db.add(ct_row)
    db.commit()
    db.refresh(ct_row)
    return {"success": True, "assessment_id": ct_row.id, "ct_payable_aed": payload.ct_payable}


# ── Upcoming UAE tax deadlines ─────────────────────────────────────────────────

@router.get("/deadlines/upcoming")
async def upcoming_deadlines(
    _company_id: int = Depends(get_current_company_id),
):
    """Return next 3 UAE tax deadlines for the company with urgency colour."""
    today = date.today()

    def urgency(d: date) -> str:
        days = (d - today).days
        if days <= 30:
            return "RED"
        if days <= 60:
            return "AMBER"
        if days <= 90:
            return "YELLOW"
        return "GREEN"

    def next_vat_deadline() -> date:
        """28th of month after each quarter end (Mar/Jun/Sep/Dec)."""
        quarter_end_months = [3, 6, 9, 12]
        for m in quarter_end_months:
            dl = date(today.year, m, 28) + timedelta(days=28)
            # 28th of next month
            if m == 12:
                dl = date(today.year + 1, 1, 28)
            else:
                dl = date(today.year, m + 1, 28)
            if dl >= today:
                return dl
        return date(today.year + 1, 1, 28)

    deadlines = [
        {
            "tax_type": "VAT Return",
            "deadline": next_vat_deadline().isoformat(),
            "days_remaining": (next_vat_deadline() - today).days,
            "urgency": urgency(next_vat_deadline()),
            "description": "FTA VAT return — 28th of month after quarter end",
        },
        {
            "tax_type": "E-Invoicing Phase 1",
            "deadline": "2027-01-01",
            "days_remaining": (date(2027, 1, 1) - today).days,
            "urgency": urgency(date(2027, 1, 1)),
            "description": "PEPPOL e-invoicing mandatory for large taxpayers",
        },
        {
            "tax_type": "Corporate Tax Return",
            "deadline": "2026-09-30",
            "days_remaining": (date(2026, 9, 30) - today).days,
            "urgency": urgency(date(2026, 9, 30)),
            "description": "CT return — 9 months after FY end (Dec FY)",
        },
        {
            "tax_type": "ESR Notification",
            "deadline": "2026-06-30",
            "days_remaining": (date(2026, 6, 30) - today).days,
            "urgency": urgency(date(2026, 6, 30)),
            "description": "Economic Substance Regulations notification",
        },
    ]

    # Sort by days remaining, return top 4
    deadlines.sort(key=lambda x: x["days_remaining"])
    return [d for d in deadlines if d["days_remaining"] >= 0][:4]
