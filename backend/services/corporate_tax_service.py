"""Corporate Tax computation, return PDF, and transfer pricing checks."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Any, Dict, List, Literal, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

CT_ZERO_BAND = Decimal("375000")
CT_RATE = Decimal("0.09")
SBR_REVENUE_CAP = Decimal("3000000")
TP_PARTY_THRESHOLD = Decimal("3000000")
TP_TOTAL_THRESHOLD = Decimal("40000000")

FreeZoneStatus = Literal["mainland", "free_zone_qfzp", "free_zone_non_qfzp"]


def _d(value: float | int | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def compute_ct(
    accounting_profit: float,
    free_zone_status: FreeZoneStatus,
    revenue: float,
    related_party_transactions: float = 0,
    exempt_income: float = 0,
    non_deductible_expenses: float = 0,
    qualifying_income: Optional[float] = None,
    small_business_relief: bool = False,
) -> Dict[str, Any]:
    """Compute UAE CT liability with mainland, QFZP, and SBR rules."""
    profit = _d(accounting_profit)
    rp = _d(related_party_transactions)
    exempt = _d(exempt_income)
    non_ded = _d(non_deductible_expenses)
    rev = _d(revenue)

    taxable = profit + non_ded - exempt
    if taxable < 0:
        taxable = Decimal("0.00")

    breakdown: List[Dict[str, Any]] = [
        {"label": "Accounting profit", "amount_aed": float(profit)},
        {"label": "Add: non-deductible expenses", "amount_aed": float(non_ded)},
        {"label": "Less: exempt income", "amount_aed": float(-exempt)},
        {"label": "Taxable income (before reliefs)", "amount_aed": float(taxable)},
    ]

    sbr_applied = False
    ct_payable = Decimal("0.00")
    amount_at_0 = Decimal("0.00")
    amount_at_9 = Decimal("0.00")

    if small_business_relief and rev > 0 and rev <= SBR_REVENUE_CAP:
        sbr_applied = True
        breakdown.append({
            "label": "Small Business Relief (revenue ≤ AED 3M)",
            "amount_aed": 0,
            "note": "CT payable reduced to AED 0",
        })
    elif free_zone_status == "free_zone_qfzp":
        qual = _d(qualifying_income if qualifying_income is not None else taxable)
        qual = min(qual, taxable)
        non_qual = max(Decimal("0.00"), taxable - qual)
        amount_at_0 = qual
        if non_qual <= CT_ZERO_BAND:
            amount_at_9 = non_qual
            ct_payable = Decimal("0.00")
        else:
            amount_at_0 = qual + CT_ZERO_BAND
            amount_at_9 = non_qual - CT_ZERO_BAND
            ct_payable = amount_at_9 * CT_RATE
        breakdown.extend([
            {"label": "QFZP qualifying income @ 0%", "amount_aed": float(qual)},
            {"label": "Non-qualifying income @ 9% (after AED 375k band)", "amount_aed": float(amount_at_9)},
        ])
    else:
        amount_at_0 = min(taxable, CT_ZERO_BAND)
        amount_at_9 = max(Decimal("0.00"), taxable - CT_ZERO_BAND)
        ct_payable = amount_at_9 * CT_RATE
        breakdown.extend([
            {"label": "First AED 375,000 @ 0%", "amount_aed": float(amount_at_0)},
            {"label": "Balance @ 9%", "amount_aed": float(amount_at_9)},
        ])

    ct_payable = ct_payable.quantize(Decimal("0.01"))
    effective_rate = (
        float((ct_payable / taxable * Decimal("100")).quantize(Decimal("0.01")))
        if taxable > 0
        else 0.0
    )

    return {
        "taxable_income_aed": float(taxable),
        "ct_payable_aed": float(ct_payable),
        "effective_rate_percent": effective_rate,
        "free_zone_status": free_zone_status,
        "small_business_relief_applied": sbr_applied,
        "related_party_transactions_aed": float(rp),
        "breakdown": breakdown,
    }


def tp_check(
    transaction_amount: float,
    party_name: str,
    relationship: str,
    party_ytd_total: float = 0,
    all_related_party_total: float = 0,
) -> Dict[str, Any]:
    """Check if transfer pricing documentation is required."""
    amount = _d(transaction_amount)
    party_total = _d(party_ytd_total) + amount
    aggregate = _d(all_related_party_total) + amount

    flags: List[str] = []
    if party_total >= TP_PARTY_THRESHOLD:
        flags.append(f"Party '{party_name}' YTD related-party total ≥ AED 3M")
    if aggregate >= TP_TOTAL_THRESHOLD:
        flags.append("Aggregate related-party transactions ≥ AED 40M")

    documentation_required = len(flags) > 0
    return {
        "party_name": party_name,
        "relationship": relationship,
        "transaction_amount_aed": float(amount),
        "party_ytd_total_aed": float(party_total),
        "aggregate_related_party_aed": float(aggregate),
        "documentation_required": documentation_required,
        "flags": flags,
        "thresholds": {
            "per_party_aed": float(TP_PARTY_THRESHOLD),
            "aggregate_aed": float(TP_TOTAL_THRESHOLD),
        },
        "recommendation": (
            "Prepare arm's length documentation and TP file before filing."
            if documentation_required
            else "Transaction below TP documentation thresholds — monitor cumulative totals."
        ),
    }


def generate_ct_return_pdf(
    company_name: str,
    trn: Optional[str],
    tax_period_start: date,
    tax_period_end: date,
    revenue: float,
    taxable_income: float,
    exemptions_claimed: float,
    ct_payable: float,
) -> bytes:
    """Generate FTA-format CT return summary PDF."""
    payment_due = date(tax_period_end.year, tax_period_end.month, tax_period_end.day)
    # 9 months after FY end
    month = tax_period_end.month + 9
    year = tax_period_end.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(tax_period_end.day, 28)
    payment_due = date(year, month, day)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=12)
    normal = styles["Normal"]

    story = [
        Paragraph("UAE Corporate Tax Return — Draft", title_style),
        Paragraph(f"Entity: {company_name}", normal),
        Paragraph(f"TRN: {trn or 'Not provided'}", normal),
        Spacer(1, 12),
        Paragraph(
            f"Tax period: {tax_period_start.isoformat()} to {tax_period_end.isoformat()}",
            normal,
        ),
        Spacer(1, 16),
    ]

    data = [
        ["Field", "Amount (AED)"],
        ["Revenue", f"{revenue:,.2f}"],
        ["Taxable income", f"{taxable_income:,.2f}"],
        ["Exemptions claimed", f"{exemptions_claimed:,.2f}"],
        ["Corporate tax payable", f"{ct_payable:,.2f}"],
        ["Payment due date", payment_due.isoformat()],
    ]
    table = Table(data, colWidths=[100 * mm, 60 * mm])
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A1A35")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#E8C96A")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ])
    )
    story.append(table)
    story.append(Spacer(1, 20))
    story.append(
        Paragraph(
            "Draft for internal review only. Confirm all figures with a licensed UAE tax advisor before e-filing via EmaraTax.",
            ParagraphStyle("Disclaimer", parent=normal, fontSize=8, textColor=colors.grey),
        )
    )
    doc.build(story)
    return buffer.getvalue()
