"""Corporate Tax calculation and advisory endpoints."""
import json
import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import CTReturn

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
async def calculate_ct(request: CalculateCTRequest, db: Session = Depends(get_db)):
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
        company_id=request.company_id,
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
    company_id: int = Query(...),
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


@router.get("/returns/{return_id}")
async def get_ct_return(return_id: int, db: Session = Depends(get_db)):
    row = db.query(CTReturn).filter(CTReturn.id == return_id).first()
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


@router.post("/suggest-addbacks")
async def suggest_addbacks(payload: SuggestAddbacksRequest):
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
