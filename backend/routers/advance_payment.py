"""Advance payment VAT tracker API endpoints."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import AdvancePayment

router = APIRouter(prefix="/api/advance-payment", tags=["Advance Payment VAT"])


def _quarter_label(d: date) -> str:
    q = ((d.month - 1) // 3) + 1
    labels = {
        1: "Q1 Jan-Mar",
        2: "Q2 Apr-Jun",
        3: "Q3 Jul-Sep",
        4: "Q4 Oct-Dec",
    }
    return f"{labels[q]} {d.year}"


def _normalize_vat_rate(vat_rate: float) -> float:
    """Accept percentage (5 = 5%) or decimal (0.05) for backward compatibility."""
    if vat_rate > 1:
        return vat_rate / 100.0
    return vat_rate


def _compute_status(advance_date: date, delivery_date: date) -> str:
    today = date.today()
    if delivery_date <= today:
        return "fully_settled"
    if advance_date <= today:
        return "vat_overdue"
    return "vat_due_this_period"


class AdvancePaymentCalcIn(BaseModel):
    order_value: float = Field(..., gt=0)
    advance_amount: float = Field(..., ge=0)
    advance_date: date
    delivery_date: date
    vat_rate: float = Field(default=5, ge=0, le=100)


class AdvancePaymentSaveIn(AdvancePaymentCalcIn):
    description: Optional[str] = None


class AdvancePaymentCalcOut(BaseModel):
    vat_at_advance: float
    vat_at_delivery: float
    total_vat: float
    advance_period: str
    delivery_period: str
    tax_invoice_due: str
    is_overdue: bool
    status: Literal["vat_overdue", "vat_due_this_period", "fully_settled"]


class AdvancePaymentItem(BaseModel):
    id: int
    description: Optional[str]
    order_value: float
    advance_amount: float
    advance_date: str
    delivery_date: str
    vat_rate: float
    vat_at_advance: float
    vat_at_delivery: float
    status: Literal["vat_overdue", "vat_due_this_period", "fully_settled"]
    created_at: str


def _calculate(body: AdvancePaymentCalcIn) -> AdvancePaymentCalcOut:
    if body.advance_amount > body.order_value:
        raise HTTPException(status_code=400, detail="Advance amount cannot exceed order value")
    if body.delivery_date < body.advance_date:
        raise HTTPException(status_code=400, detail="Delivery date cannot be before advance date")

    rate = _normalize_vat_rate(body.vat_rate)
    remaining = max(0.0, body.order_value - body.advance_amount)
    vat_at_advance = round(body.advance_amount * rate, 2)
    vat_at_delivery = round(remaining * rate, 2)
    total_vat = round(vat_at_advance + vat_at_delivery, 2)
    status = _compute_status(body.advance_date, body.delivery_date)
    today = date.today()
    is_overdue = body.advance_date <= today and body.delivery_date > today

    return AdvancePaymentCalcOut(
        vat_at_advance=vat_at_advance,
        vat_at_delivery=vat_at_delivery,
        total_vat=total_vat,
        advance_period=_quarter_label(body.advance_date),
        delivery_period=_quarter_label(body.delivery_date),
        tax_invoice_due=body.advance_date.strftime("%d %b %Y"),
        is_overdue=is_overdue,
        status=status,
    )


@router.post("/calculate", response_model=AdvancePaymentCalcOut)
async def calculate_advance_payment(
    body: AdvancePaymentCalcIn,
    company_id: int = Depends(get_current_company_id),
):
    _ = company_id
    return _calculate(body)


@router.post("/save")
async def save_advance_payment(
    body: AdvancePaymentSaveIn,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    result = _calculate(body)
    row = AdvancePayment(
        company_id=company_id,
        description=(body.description or "").strip() or None,
        order_value=body.order_value,
        advance_amount=body.advance_amount,
        advance_date=body.advance_date,
        delivery_date=body.delivery_date,
        vat_rate=_normalize_vat_rate(body.vat_rate),
        status=result.status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "status": row.status}


@router.get("/list", response_model=List[AdvancePaymentItem])
async def list_advance_payments(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AdvancePayment)
        .filter(AdvancePayment.company_id == company_id)
        .order_by(AdvancePayment.advance_date.desc(), AdvancePayment.id.desc())
        .all()
    )
    out: List[AdvancePaymentItem] = []
    for row in rows:
        calc = _calculate(
            AdvancePaymentCalcIn(
                order_value=float(row.order_value),
                advance_amount=float(row.advance_amount),
                advance_date=row.advance_date,
                delivery_date=row.delivery_date,
                vat_rate=float(row.vat_rate),
            )
        )
        out.append(
            AdvancePaymentItem(
                id=row.id,
                description=row.description,
                order_value=float(row.order_value),
                advance_amount=float(row.advance_amount),
                advance_date=row.advance_date.isoformat(),
                delivery_date=row.delivery_date.isoformat(),
                vat_rate=float(row.vat_rate),
                vat_at_advance=calc.vat_at_advance,
                vat_at_delivery=calc.vat_at_delivery,
                status=calc.status,
                created_at=row.created_at.isoformat() if row.created_at else datetime.utcnow().isoformat(),
            )
        )
    return out


@router.get("/export-csv")
async def export_advance_payments_csv(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
    _: Optional[int] = Query(default=None, alias="company_id"),
):
    rows = (
        db.query(AdvancePayment)
        .filter(AdvancePayment.company_id == company_id)
        .order_by(AdvancePayment.advance_date.desc(), AdvancePayment.id.desc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Date",
            "Description",
            "Order Value",
            "Advance",
            "VAT at Advance",
            "Remaining VAT",
            "Delivery Date",
            "Status",
        ]
    )
    for row in rows:
        calc = _calculate(
            AdvancePaymentCalcIn(
                order_value=float(row.order_value),
                advance_amount=float(row.advance_amount),
                advance_date=row.advance_date,
                delivery_date=row.delivery_date,
                vat_rate=float(row.vat_rate),
            )
        )
        writer.writerow(
            [
                row.advance_date.isoformat(),
                row.description or "",
                f"{float(row.order_value):.2f}",
                f"{float(row.advance_amount):.2f}",
                f"{calc.vat_at_advance:.2f}",
                f"{calc.vat_at_delivery:.2f}",
                row.delivery_date.isoformat(),
                calc.status,
            ]
        )
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    headers = {"Content-Disposition": 'attachment; filename="advance_payments.csv"'}
    return StreamingResponse(data, media_type="text/csv", headers=headers)
