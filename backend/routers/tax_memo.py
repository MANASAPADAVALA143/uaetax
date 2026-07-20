"""AI Tax Memo Generator — POST /api/tax/generate-memo

Gathers live data from DB, sends to Claude for narrative generation.
All financial calculations happen in Python — Claude writes prose only.
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import (
    AuditLog,
    CTReturn,
    FTASubmissionLog,
    Transaction,
    VATReturn,
)
from utils.audit import log_ai_audit
from utils.prompt_guard import sanitize_input

router = APIRouter(prefix="/api/tax", tags=["Tax Memo"])

_claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY")) if os.getenv("ANTHROPIC_API_KEY") else None


# ── Pydantic models ────────────────────────────────────────────────────────────

MemoType = Literal["VAT_PERIOD", "CT_ANNUAL", "RISK_ALERT", "BOARD_UPDATE"]


class GenerateMemoRequest(BaseModel):
    memo_type: MemoType
    period: str = Field(..., description="e.g. Q1-2025 or FY-2025")
    regenerate: bool = Field(False, description="Force regeneration even if cached")


class MemoResponse(BaseModel):
    memo_id: int
    memo_text: str
    memo_type: str
    period: str
    data_used: Dict[str, Any]
    generated_at: str
    cached: bool = False


# ── Period parsing ─────────────────────────────────────────────────────────────

def _parse_period(period: str) -> tuple[date, date]:
    """Convert 'Q1-2025' or 'FY-2025' to (start, end) dates."""
    p = period.upper().strip()
    if p.startswith("Q"):
        quarter = int(p[1])
        year = int(p[3:])
        quarter_map = {
            1: (date(year, 1, 1),  date(year, 3, 31)),
            2: (date(year, 4, 1),  date(year, 6, 30)),
            3: (date(year, 7, 1),  date(year, 9, 30)),
            4: (date(year, 10, 1), date(year, 12, 31)),
        }
        return quarter_map.get(quarter, (date(year, 1, 1), date(year, 12, 31)))
    elif p.startswith("FY"):
        year = int(p[3:])
        return date(year, 1, 1), date(year, 12, 31)
    else:
        # Try YYYY format
        try:
            year = int(p)
            return date(year, 1, 1), date(year, 12, 31)
        except ValueError:
            raise ValueError(f"Cannot parse period: {period}")


# ── Data gathering (all Python, no JS) ───────────────────────────────────────

def gather_memo_data(company_id: int, period: str, db: Session) -> Dict[str, Any]:
    """Pull all data from DB for memo generation. No calculations in Claude."""
    try:
        start, end = _parse_period(period)
    except ValueError:
        start, end = date.today().replace(month=1, day=1), date.today()

    # ── VAT transactions in period ──
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .all()
    )

    total_transactions = len(txns)
    unverified_count = sum(1 for t in txns if not t.is_verified)

    standard_rated_sales = sum(
        t.amount_aed for t in txns
        if t.vat_treatment == "standard_rated" and t.transaction_type == "sale"
    )
    zero_rated_aed = sum(
        t.amount_aed for t in txns if t.vat_treatment == "zero_rated"
    )
    exempt_aed = sum(
        t.amount_aed for t in txns if t.vat_treatment == "exempt"
    )
    reverse_charge_aed = sum(
        t.vat_amount_aed for t in txns if t.vat_treatment == "reverse_charge"
    )
    rc_undeclared_count = sum(
        1 for t in txns
        if t.vat_treatment == "reverse_charge" and not t.is_verified
    )
    vat_on_sales = sum(
        t.vat_amount_aed for t in txns
        if t.transaction_type == "sale" and t.vat_treatment == "standard_rated"
    )
    input_tax = sum(
        t.vat_amount_aed for t in txns
        if t.transaction_type == "purchase" and t.vat_treatment == "standard_rated"
    )

    # ── Exception / high-risk flags ──
    high_risk_flags = [
        {
            "id": t.id,
            "description": t.description[:80],
            "amount_aed": t.amount_aed,
            "flag_reason": "Low confidence" if (t.confidence_score or 1) < 0.6 else "Unverified large amount",
        }
        for t in txns
        if (not t.is_verified and t.amount_aed > 50000)
        or ((t.confidence_score or 1) < 0.6 and t.amount_aed > 10000)
    ]

    missing_trn_count = sum(
        1 for t in txns
        if t.transaction_type == "purchase"
        and not t.invoice_number
        and t.amount_aed > 10000
    )

    # ── VAT Return box values (latest filed/draft for period) ──
    vat_return = (
        db.query(VATReturn)
        .filter(
            VATReturn.company_id == company_id,
            VATReturn.period_start >= start,
            VATReturn.period_end <= end,
        )
        .order_by(VATReturn.id.desc())
        .first()
    )

    vat_payable_aed = vat_return.box8_vat_payable_or_refundable if vat_return else (vat_on_sales - input_tax + reverse_charge_aed)
    exception_flags = [t.description[:60] for t in txns if not t.is_verified and t.amount_aed > 100000]

    # ── CT position (latest CT return for period's year) ──
    ct_return = (
        db.query(CTReturn)
        .filter(
            CTReturn.company_id == company_id,
            CTReturn.tax_period_start >= start.replace(month=1, day=1),
        )
        .order_by(CTReturn.id.desc())
        .first()
    )

    accounting_profit = ct_return.accounting_profit if ct_return else 0.0
    taxable_income = ct_return.taxable_income if ct_return else 0.0
    ct_payable_aed = float(ct_return.ct_payable) if ct_return else 0.0
    disallowed_items: List[str] = []
    if ct_return:
        if ct_return.total_addbacks and ct_return.total_addbacks > 0:
            disallowed_items.append(f"Addbacks: AED {ct_return.total_addbacks:,.0f}")

    # ── Compliance health score ──
    score = 100
    if total_transactions > 0:
        unverified_pct = unverified_count / total_transactions
        score -= int(unverified_pct * 40)
    if rc_undeclared_count > 0:
        score -= min(20, rc_undeclared_count * 5)
    if missing_trn_count > 0:
        score -= min(15, missing_trn_count * 3)
    if len(high_risk_flags) > 0:
        score -= min(15, len(high_risk_flags) * 3)
    health_score = max(0, min(100, score))

    # ── Next filing deadline ──
    today = date.today()
    quarter_deadlines = {
        1: date(today.year, 4, 28),
        2: date(today.year, 7, 28),
        3: date(today.year, 10, 28),
        4: date(today.year + 1, 1, 28),
    }
    current_quarter = (today.month - 1) // 3 + 1
    next_deadline = quarter_deadlines[current_quarter]
    if next_deadline < today:
        nq = current_quarter % 4 + 1
        next_deadline = quarter_deadlines[nq]
    days_to_deadline = (next_deadline - today).days

    # ── Filing history ──
    past_returns = (
        db.query(VATReturn)
        .filter(VATReturn.company_id == company_id, VATReturn.status == "submitted")
        .count()
    )

    return {
        # VAT
        "vat_payable_aed": round(vat_payable_aed, 2),
        "vat_on_sales_aed": round(vat_on_sales, 2),
        "input_tax_aed": round(input_tax, 2),
        "total_transactions": total_transactions,
        "unverified_count": unverified_count,
        "reverse_charge_aed": round(reverse_charge_aed, 2),
        "zero_rated_aed": round(zero_rated_aed, 2),
        "exempt_aed": round(exempt_aed, 2),
        "standard_rated_sales_aed": round(standard_rated_sales, 2),
        "exception_flags": exception_flags[:5],
        # CT
        "accounting_profit": round(accounting_profit, 2),
        "taxable_income": round(taxable_income, 2),
        "ct_payable_aed": round(ct_payable_aed, 2),
        "disallowed_items": disallowed_items,
        # Compliance
        "health_score": health_score,
        "next_deadline": next_deadline.isoformat(),
        "days_to_deadline": days_to_deadline,
        "filing_history": past_returns,
        # Exceptions
        "high_risk_flags": high_risk_flags[:10],
        "missing_trn_count": missing_trn_count,
        "rc_undeclared_count": rc_undeclared_count,
        # Period
        "period": period,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
    }


# ── Claude memo generation ─────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a UAE tax advisor writing a professional memo for a CFO or Tax Head.
Write in formal business English. Use specific numbers — never round unless the actual figure is round.
Always cite UAE law where relevant: Federal Decree-Law No.8 of 2017 (VAT), Federal Decree-Law No.47 of 2022 (CT).
Never invent figures — only use what is provided in the data.
If any data field is zero or unavailable, state "data not available for this period" — never assume.
Format exactly as: SUBJECT, EXECUTIVE SUMMARY, VAT POSITION, CORPORATE TAX POSITION, RISK ITEMS, RECOMMENDED ACTIONS, SIGN-OFF.
End with this exact disclaimer on a new line:
---
This memo is AI-assisted and requires review by a qualified UAE tax advisor before submission or board presentation."""


def _build_user_prompt(memo_type: str, data: Dict[str, Any]) -> str:
    return f"""Prepare a {memo_type.replace('_', ' ').title()} tax advisory memo for the CFO.

PERIOD: {data['period']} ({data['period_start']} to {data['period_end']})
COMPANY VAT HEALTH SCORE: {data['health_score']}/100

VAT POSITION:
- Estimated VAT payable (Box 8): AED {data['vat_payable_aed']:,.2f}
- VAT on standard-rated sales: AED {data['vat_on_sales_aed']:,.2f}
- Input tax recoverable: AED {data['input_tax_aed']:,.2f}
- Total transactions classified: {data['total_transactions']}
- Unverified transactions: {data['unverified_count']}
- Zero-rated supplies: AED {data['zero_rated_aed']:,.2f}
- Exempt supplies: AED {data['exempt_aed']:,.2f}
- Reverse charge VAT to declare: AED {data['reverse_charge_aed']:,.2f}

CORPORATE TAX POSITION:
- Accounting profit: AED {data['accounting_profit']:,.2f}
- Estimated taxable income: AED {data['taxable_income']:,.2f}
- CT payable (9% above AED 375,000 threshold): AED {data['ct_payable_aed']:,.2f}
- Disallowed items identified: {len(data['disallowed_items'])} ({'; '.join(data['disallowed_items']) or 'none recorded'})

RISK ITEMS:
- High-risk flagged transactions: {len(data['high_risk_flags'])}
- Missing TRN on purchases >AED 10,000: {data['missing_trn_count']}
- Reverse charge transactions undeclared: {data['rc_undeclared_count']}
- Large unverified transactions: {data['exception_flags'][:3]}

NEXT VAT FILING DEADLINE: {data['next_deadline']} ({data['days_to_deadline']} days from today)
PAST SUBMITTED RETURNS: {data['filing_history']}

Write the CFO memo now. Include exactly:
1. SUBJECT line (one line)
2. EXECUTIVE SUMMARY (3 sentences — liability, key risk, action required)
3. VAT POSITION (key numbers + risks, cite Federal Decree-Law No.8 of 2017 where relevant)
4. CORPORATE TAX POSITION (cite Federal Decree-Law No.47 of 2022 where relevant)
5. TOP 3 RISK ITEMS requiring immediate action (numbered list)
6. RECOMMENDED ACTIONS with specific deadlines (numbered list)
7. Sign-off line: "Prepared by: UAE Tax | For review by: [Tax Head Name]"
"""


# ── DB model for memo storage ─────────────────────────────────────────────────
# (stored via raw SQL insert since we add the ORM model in migration below)

def _save_memo(
    company_id: int,
    memo_type: str,
    period: str,
    memo_text: str,
    data_snapshot: Dict[str, Any],
    db: Session,
) -> int:
    from sqlalchemy import text
    result = db.execute(
        text("""
            INSERT INTO tax_memos
              (company_id, memo_type, period, memo_text, data_snapshot_json, generated_at)
            VALUES
              (:company_id, :memo_type, :period, :memo_text, :data_snapshot, NOW())
            RETURNING id
        """),
        {
            "company_id": company_id,
            "memo_type": memo_type,
            "period": period,
            "memo_text": memo_text,
            "data_snapshot": json.dumps(data_snapshot),
        },
    )
    db.commit()
    return result.fetchone()[0]


def _get_cached_memo(company_id: int, memo_type: str, period: str, db: Session):
    from sqlalchemy import text
    row = db.execute(
        text("""
            SELECT id, memo_text, data_snapshot_json, generated_at
            FROM tax_memos
            WHERE company_id = :cid AND memo_type = :mtype AND period = :period
            ORDER BY generated_at DESC LIMIT 1
        """),
        {"cid": company_id, "mtype": memo_type, "period": period},
    ).fetchone()
    return row


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/generate-memo", response_model=MemoResponse)
async def generate_memo(
    req: GenerateMemoRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Generate an AI-written tax memo from live company data."""
    if _claude is None:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    # Check cache first
    if not req.regenerate:
        cached = _get_cached_memo(company_id, req.memo_type, req.period, db)
        if cached:
            return MemoResponse(
                memo_id=cached[0],
                memo_text=cached[1],
                memo_type=req.memo_type,
                period=req.period,
                data_used=json.loads(cached[2]) if cached[2] else {},
                generated_at=cached[3].isoformat() if cached[3] else "",
                cached=True,
            )

    # Gather live data from DB
    period = sanitize_input(req.period or "", "memo_period")
    data = gather_memo_data(company_id, period, db)

    # Generate memo via Claude (narrative only — no calculations)
    try:
        message = _claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_prompt(req.memo_type, data)}],
        )
        memo_text = message.content[0].text
        try:
            log_ai_audit(
                db,
                company_id=company_id,
                user_email="user",
                action_type="ai_call",
                feature="tax_memo",
                input_summary=f"{req.memo_type} memo for {period}",
                output_summary=memo_text[:100],
                status="success",
            )
        except Exception:
            pass
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude API error: {exc}") from exc

    # Save to DB
    memo_id = _save_memo(company_id, req.memo_type, period, memo_text, data, db)

    return MemoResponse(
        memo_id=memo_id,
        memo_text=memo_text,
        memo_type=req.memo_type,
        period=period,
        data_used=data,
        generated_at=datetime.now(timezone.utc).isoformat(),
        cached=False,
    )


@router.get("/memos")
async def list_memos(
    company_id: int = Depends(get_current_company_id),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List past generated tax memos for the company."""
    from sqlalchemy import text
    rows = db.execute(
        text("""
            SELECT id, memo_type, period, memo_text, generated_at
            FROM tax_memos
            WHERE company_id = :cid
            ORDER BY generated_at DESC
            LIMIT :limit
        """),
        {"cid": company_id, "limit": limit},
    ).fetchall()

    return [
        {
            "id": r[0],
            "memo_type": r[1],
            "period": r[2],
            "memo_text": r[3],
            "generated_at": r[4].isoformat() if r[4] else None,
        }
        for r in rows
    ]
