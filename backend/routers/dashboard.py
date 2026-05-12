"""Dashboard summary API."""
from calendar import monthrange
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog, Company, ReconciliationResult, Transaction
from routers.vat_return import calculate_vat_return_boxes

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _add_months(d0: date, months: int) -> date:
    total = d0.year * 12 + d0.month - 1 + months
    y = total // 12
    m = total % 12 + 1
    day = min(d0.day, monthrange(y, m)[1])
    return date(y, m, day)


def _calendar_quarter(today: date) -> Tuple[date, date, str]:
    q = (today.month - 1) // 3 + 1
    start_month = 3 * (q - 1) + 1
    start = date(today.year, start_month, 1)
    if q == 4:
        end = date(today.year, 12, 31)
    else:
        end = date(today.year, start_month + 3, 1) - timedelta(days=1)
    return start, end, f"Q{q} {today.year}"


def _vat_filing_deadline(period_end: date) -> date:
    return period_end + timedelta(days=28)


def _days_between(d0: date, d1: date) -> int:
    return (d1 - d0).days


@router.get("/summary")
async def dashboard_summary(
    company_id: int = Query(..., description="Company ID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    today = date.today()
    period_start, period_end, label = _calendar_quarter(today)
    filing_deadline = _vat_filing_deadline(period_end)
    days_to_filing = _days_between(today, filing_deadline)

    period_tx = (
        db.query(Transaction)
        .filter(
            and_(
                Transaction.company_id == company_id,
                Transaction.date >= period_start,
                Transaction.date <= period_end,
            )
        )
        .all()
    )

    transactions_classified = len([t for t in period_tx if t.vat_treatment])
    transactions_needing_review = len(
        [
            t
            for t in period_tx
            if t.vat_treatment and (t.confidence_score is None or t.confidence_score < 70)
        ]
    )

    estimated_payable_aed = 0.0
    if period_tx:
        boxes = calculate_vat_return_boxes(period_tx)
        estimated_payable_aed = max(0.0, boxes["box8_vat_payable_or_refundable"])

    last_fy_end = date(today.year - 1, 12, 31)
    ct_deadline = _add_months(last_fy_end, 9)
    days_to_ct = _days_between(today, ct_deadline)

    mandate = date(2027, 1, 1)
    days_to_mandate = _days_between(today, mandate)
    revenue = company.annual_revenue_aed or 0.0
    asp_ok = bool(company.asp_appointed)

    readiness = 72
    if revenue >= 50_000_000:
        readiness = 38 if not asp_ok else 55
    elif revenue >= 10_000_000:
        readiness = 58 if not asp_ok else 72
    if not company.vat_registered:
        readiness = min(readiness, 50)

    recent_rows = (
        db.query(AuditLog)
        .filter(AuditLog.company_id == company_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(12)
        .all()
    )
    recent_activity: List[Dict[str, Any]] = [
        {
            "timestamp": r.timestamp.isoformat() if r.timestamp else "",
            "actor": r.actor,
            "action": r.action,
            "entity": r.entity or "",
        }
        for r in recent_rows
    ]

    pending_approvals = len(
        [
            t
            for t in period_tx
            if not t.is_verified
            and t.vat_treatment
            and (t.confidence_score is None or t.confidence_score < 85)
        ]
    )

    open_mismatches = (
        db.query(func.count(ReconciliationResult.id))
        .filter(
            and_(
                ReconciliationResult.company_id == company_id,
                ReconciliationResult.status == "mismatch_found",
            )
        )
        .scalar()
        or 0
    )

    ct_status = "not_started"

    return {
        "current_period": {
            "start_date": period_start.isoformat(),
            "end_date": period_end.isoformat(),
            "label": label,
        },
        "vat": {
            "estimated_payable_aed": round(float(estimated_payable_aed), 2),
            "transactions_classified": transactions_classified,
            "transactions_needing_review": transactions_needing_review,
            "days_to_filing": days_to_filing,
            "filing_deadline": filing_deadline.isoformat(),
        },
        "corporate_tax": {
            "estimated_liability_aed": 0.0,
            "filing_deadline": ct_deadline.isoformat(),
            "days_to_deadline": days_to_ct,
            "status": ct_status,
        },
        "e_invoicing": {
            "readiness_score": int(readiness),
            "mandate_date": mandate.isoformat(),
            "days_to_mandate": days_to_mandate,
            "asp_appointed": asp_ok,
        },
        "recent_activity": recent_activity,
        "pending_approvals": int(pending_approvals),
        "open_reconciliation_mismatches": int(open_mismatches),
    }


@router.get("/activity")
async def dashboard_activity(
    company_id: int = Query(..., description="Company ID"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Activity feed for dashboard timeline widgets."""
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.company_id == company_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else "",
            "actor": r.actor,
            "action": r.action,
            "entity": r.entity,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "before_state": r.before_state,
            "after_state": r.after_state,
        }
        for r in rows
    ]
