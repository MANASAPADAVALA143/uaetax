"""FTA Reports — generate UAE FTA-ready audit reports from transaction data."""
import json
import os
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Transaction, Company, Invoice

router = APIRouter(prefix="/api/fta", tags=["fta-reports"])


def _tx_side(t: Transaction) -> str:
    return "sale" if t.transaction_type == "sale" else "purchase"


@router.get("/summary")
def fta_summary(
    period_start: date = Query(...),
    period_end: date = Query(...),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """High-level VAT summary for the period — all boxes pre-computed."""
    txns = db.query(Transaction).filter(
        and_(
            Transaction.company_id == company_id,
            Transaction.date >= period_start,
            Transaction.date <= period_end,
        )
    ).all()

    sales = [t for t in txns if t.transaction_type == "sale"]
    purchases = [t for t in txns if t.transaction_type == "purchase"]

    def amt(lst): return round(sum(t.amount_aed for t in lst), 2)
    def vat(lst): return round(sum(t.vat_amount_aed or 0 for t in lst), 2)
    def by_treatment(lst, treatment):
        return [t for t in lst if t.vat_treatment == treatment]

    std_sales    = by_treatment(sales, "standard_rated")
    zero_sales   = by_treatment(sales, "zero_rated")
    exempt_sales = by_treatment(sales, "exempt")
    std_purch    = by_treatment(purchases, "standard_rated")
    rc_purch     = by_treatment(purchases, "reverse_charge")

    box1 = amt(std_sales)
    box2 = vat(std_sales)
    box3 = amt(zero_sales)
    box4 = amt(exempt_sales)
    box5 = round(box1 + box3 + box4, 2)
    box6 = amt(std_purch) + amt(rc_purch)
    box7 = vat(std_purch) + vat(rc_purch)
    box8 = round(box2 - box7, 2)

    company = db.query(Company).filter(Company.id == company_id).first()

    return {
        "company_name": company.name if company else "Unknown",
        "trn": getattr(company, "trn", None),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "transaction_count": len(txns),
        "vat_boxes": {
            "box1_standard_rated_sales": box1,
            "box2_output_vat": box2,
            "box3_zero_rated_sales": box3,
            "box4_exempt_sales": box4,
            "box5_total_taxable_supplies": box5,
            "box6_taxable_expenses": round(box6, 2),
            "box7_input_vat_recoverable": round(box7, 2),
            "box8_net_vat_payable": box8,
        },
        "counts": {
            "standard_rated_sales": len(std_sales),
            "zero_rated_sales": len(zero_sales),
            "exempt_sales": len(exempt_sales),
            "standard_rated_purchases": len(std_purch),
            "reverse_charge_purchases": len(rc_purch),
        },
    }


@router.get("/transaction-listing")
def fta_transaction_listing(
    period_start: date = Query(...),
    period_end: date = Query(...),
    tx_type: Optional[str] = Query(None, description="sale | purchase | all"),
    vat_treatment: Optional[str] = Query(None),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Full transaction listing — FTA Tax Audit File (TAF) format."""
    filters = [
        Transaction.company_id == company_id,
        Transaction.date >= period_start,
        Transaction.date <= period_end,
    ]
    if tx_type and tx_type != "all":
        filters.append(Transaction.transaction_type == tx_type)
    if vat_treatment:
        filters.append(Transaction.vat_treatment == vat_treatment)

    txns = db.query(Transaction).filter(and_(*filters)).order_by(Transaction.date).all()

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_records": len(txns),
        "transactions": [
            {
                "id": t.id,
                "date": t.date.isoformat() if t.date else None,
                "description": t.description,
                "vendor_customer": t.vendor_or_customer,
                "invoice_number": t.invoice_number,
                "type": t.transaction_type,
                "vat_treatment": t.vat_treatment,
                "amount_aed": t.amount_aed,
                "vat_amount_aed": t.vat_amount_aed or 0,
                "total_aed": round((t.amount_aed or 0) + (t.vat_amount_aed or 0), 2),
                "confidence": t.confidence,
            }
            for t in txns
        ],
    }


@router.get("/ap-risk-summary")
def fta_ap_risk_summary(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """AP Invoice anomaly summary — blocked VAT, missing TRNs, duplicates."""
    invoices = db.query(Invoice).filter(
        Invoice.company_id == company_id
    ).order_by(Invoice.created_at.desc()).all()

    total_vat_at_risk = 0.0
    high_flags = 0
    medium_flags = 0
    low_flags = 0
    blocked_vat = 0.0
    missing_trn_count = 0
    duplicate_count = 0

    for inv in invoices:
        for flag in (inv.risk_flags or []):
            sev = (flag.get("severity") or "").upper()
            if sev == "HIGH": high_flags += 1
            elif sev == "MEDIUM": medium_flags += 1
            elif sev == "LOW": low_flags += 1

            vat_risk = flag.get("vat_at_risk_aed", 0) or 0
            total_vat_at_risk += vat_risk

            flag_id = flag.get("flag", "")
            if "entertainment" in flag_id or "blocked" in flag_id:
                blocked_vat += vat_risk
            if "missing_trn" in flag_id or "invalid_trn" in flag_id:
                missing_trn_count += 1
            if "duplicate" in flag_id:
                duplicate_count += 1

    status_counts = {}
    for inv in invoices:
        status_counts[inv.status] = status_counts.get(inv.status, 0) + 1

    return {
        "total_invoices": len(invoices),
        "status_breakdown": status_counts,
        "total_vat_at_risk_aed": round(total_vat_at_risk, 2),
        "blocked_input_vat_aed": round(blocked_vat, 2),
        "flag_counts": {
            "high": high_flags,
            "medium": medium_flags,
            "low": low_flags,
            "total": high_flags + medium_flags + low_flags,
        },
        "anomaly_counts": {
            "missing_or_invalid_trn": missing_trn_count,
            "duplicate_invoices": duplicate_count,
        },
        "generated_at": datetime.utcnow().isoformat(),
    }
