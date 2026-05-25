"""Invoice Flow — AI OCR + 23-point UAE anomaly detection engine."""
import base64
import json
import math
import os
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from anthropic import Anthropic
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Invoice, Transaction

router = APIRouter(prefix="/api/invoice", tags=["invoice-flow"])

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
claude_client = Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None

# ── UAE TRN: 15 digits, starts with 1 ─────────────────────────────────────────
UAE_TRN_VALID = re.compile(r"^1\d{14}$")
UAE_TRN_ANY   = re.compile(r"^\d{15}$")   # 15 digits (some don't start with 1)

UAE_FREE_ZONES = [
    "jafza", "dafza", "difc", "adgm", "dmcc", "dso", "tecom",
    "rakez", "sharjah airport", "saif zone", "hamriyah", "kizad",
    "twofour54", "adu", "dubai airport", "dubai silicon",
]

ENTERTAINMENT_KEYWORDS = [
    "restaurant", "hotel", "entertainment", "meals", "leisure", "recreation",
    "hospitality", "catering", "food", "beverage", "drinks", "cafe", "dinner",
    "lunch", "breakfast", "nobu", "four seasons", "hilton", "hyatt", "marriott",
]

EXEMPT_KEYWORDS = [
    "bare land", "residential", "apartment lease", "villa lease", "local transport",
    "financial service", "life insurance", "dividend", "interest income",
    "residential villa", "residential apartment",
]

ZERO_RATED_KEYWORDS = [
    "export", "international transport", "sea freight", "air freight",
    "crude oil", "natural gas", "educational", "healthcare", "medical",
]

EXTRACT_PROMPT = """Extract ALL fields from this UAE VAT invoice and return JSON only (no markdown):
{
  "vendor_name": "",
  "vendor_address": "",
  "vendor_trn": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "customer_name": "",
  "customer_address": "",
  "customer_trn": "",
  "payment_terms_days": null,
  "due_date": null,
  "po_reference": null,
  "currency": "AED",
  "line_items": [{"description": "", "quantity": 0, "unit_price": 0, "vat_rate": 5}],
  "subtotal_aed": 0,
  "discount_aed": 0,
  "vat_amount_aed": 0,
  "total_aed": 0
}
If a field is not visible leave it as null. Return JSON only — no text before or after."""


# ── Pydantic models ────────────────────────────────────────────────────────────

class LineItem(BaseModel):
    description: str = ""
    quantity: float = 1
    unit_price: float = 0
    vat_rate: float = 5


class ExtractedInvoice(BaseModel):
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    vendor_trn: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_trn: Optional[str] = None
    payment_terms_days: Optional[int] = None
    due_date: Optional[str] = None
    po_reference: Optional[str] = None
    currency: str = "AED"
    line_items: List[LineItem] = []
    subtotal_aed: Optional[float] = None
    discount_aed: Optional[float] = None
    vat_amount_aed: Optional[float] = None
    total_aed: Optional[float] = None


class AnomalyFlag(BaseModel):
    flag_id: int
    flag: str
    category: str
    severity: str           # HIGH | MEDIUM | LOW
    title: str
    what_is_wrong: str
    action_required: str
    uae_law_reference: str
    vat_at_risk_aed: float  # financial impact


class RiskResult(BaseModel):
    flags: List[AnomalyFlag]
    risk_score: int          # 0-100
    risk_level: str          # HIGH | MEDIUM | LOW | CLEAR
    recommendation: str


class ClassifyRiskRequest(BaseModel):
    invoice_id: int
    extracted: ExtractedInvoice


class ReviewAction(BaseModel):
    action: str
    override_treatment: Optional[str] = None
    reason: Optional[str] = None
    reviewed_by: Optional[str] = None


# ── TF-IDF cosine similarity (no sklearn needed) ───────────────────────────────

def _tokenize(text: str) -> List[str]:
    return re.findall(r"\w+", text.lower())


def _cosine_sim(a: str, b: str) -> float:
    """Simple bag-of-words cosine similarity."""
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    vocab = set(ta) | set(tb)
    def vec(tokens):
        freq: Dict[str, int] = {}
        for t in tokens:
            freq[t] = freq.get(t, 0) + 1
        return [freq.get(v, 0) for v in vocab]
    va, vb = vec(ta), vec(tb)
    dot = sum(x * y for x, y in zip(va, vb))
    mag_a = math.sqrt(sum(x**2 for x in va))
    mag_b = math.sqrt(sum(x**2 for x in vb))
    return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0


def _mann_kendall_trend(values: List[float]) -> float:
    """Return Mann-Kendall S-statistic normalised [-1, 1].
    Positive = upward trend."""
    n = len(values)
    if n < 3:
        return 0.0
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = values[j] - values[i]
            s += (1 if diff > 0 else -1 if diff < 0 else 0)
    max_s = n * (n - 1) / 2
    return s / max_s if max_s else 0.0


# ── Main anomaly engine ────────────────────────────────────────────────────────

def run_all_anomaly_checks(
    extracted: ExtractedInvoice,
    company_id: int,
    db: Session,
    vat_treatment: str = "standard_rated",
) -> RiskResult:
    flags: List[AnomalyFlag] = []

    vendor     = (extracted.vendor_name or "").strip()
    trn        = (extracted.vendor_trn or "").strip()
    inv_no     = (extracted.invoice_number or "").strip()
    total      = extracted.total_aed or 0.0
    subtotal   = extracted.subtotal_aed or total / 1.05
    vat_shown  = extracted.vat_amount_aed or 0.0
    currency   = (extracted.currency or "AED").upper()
    inv_date_s = extracted.invoice_date or ""
    desc_all   = " ".join(li.description.lower() for li in extracted.line_items)
    vendor_addr_low = (extracted.vendor_address or "").lower()

    try:
        inv_date = datetime.strptime(inv_date_s, "%Y-%m-%d").date() if inv_date_s else None
    except ValueError:
        inv_date = None

    cutoff_90  = datetime.utcnow() - timedelta(days=90)
    cutoff_30  = datetime.utcnow() - timedelta(days=30)
    cutoff_7   = datetime.utcnow() - timedelta(days=7)
    cutoff_365 = datetime.utcnow() - timedelta(days=365)

    # ── CATEGORY 1: DUPLICATE CHECKS ──────────────────────────────────────────

    # ANOMALY 1 — Exact duplicate
    if vendor and inv_no and total:
        dup = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.invoice_number == inv_no,
                Invoice.total_aed == total,
                Invoice.created_at >= cutoff_90,
            )
        ).first()
        if dup:
            flags.append(AnomalyFlag(
                flag_id=1, flag="exact_duplicate", category="duplicate",
                severity="HIGH",
                title="Exact Duplicate Invoice",
                what_is_wrong=f"Invoice #{inv_no} from {vendor} for AED {total:,.2f} already exists (ID {dup.id}). Same TRN, invoice number, and amount within 90 days.",
                action_required="Hard hold — reject this invoice immediately. Contact supplier to confirm one invoice only.",
                uae_law_reference="Article 59, UAE VAT Law — double VAT claim attracts FTA penalty of 300% of evaded tax",
                vat_at_risk_aed=round(total * 0.05, 2),
            ))

    # ANOMALY 2 — Near duplicate (cosine similarity)
    if vendor and desc_all:
        recent_invs = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.created_at >= cutoff_90,
            )
        ).limit(20).all()
        for r in recent_invs:
            if r.invoice_number == inv_no:
                continue
            existing_desc = " ".join(
                (li.get("description", "") for li in (r.line_items or [])),
            ) if r.line_items else (r.filename or "")
            sim = _cosine_sim(desc_all, existing_desc)
            if sim > 0.85:
                flags.append(AnomalyFlag(
                    flag_id=2, flag="near_duplicate", category="duplicate",
                    severity="HIGH",
                    title="Near-Duplicate Invoice Detected",
                    what_is_wrong=f"Invoice description {sim*100:.0f}% similar to invoice ID {r.id} (#{r.invoice_number}) from same supplier. Different invoice number but identical content — possible resubmission.",
                    action_required="Compare both invoices. If same service billed twice, reject the newer one.",
                    uae_law_reference="Article 59, UAE VAT Law — duplicate input tax claim",
                    vat_at_risk_aed=round(total * 0.05, 2),
                ))
                break

    # ANOMALY 3 — Same amount same vendor within 30 days
    if vendor and total > 0:
        same_amt = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.total_aed == total,
                Invoice.created_at >= cutoff_30,
            )
        ).first()
        if same_amt and same_amt.invoice_number != inv_no:
            flags.append(AnomalyFlag(
                flag_id=3, flag="same_amount_30_days", category="duplicate",
                severity="MEDIUM",
                title="Same Amount from Same Vendor Within 30 Days",
                what_is_wrong=f"{vendor} billed AED {total:,.2f} again within 30 days (previous invoice ID {same_amt.id}). Risk of duplicate payment.",
                action_required="Verify with vendor that both invoices are for distinct services before authorising payment.",
                uae_law_reference="Internal controls — duplicate payment fraud prevention",
                vat_at_risk_aed=round(total * 0.05, 2),
            ))

    # ANOMALY 4 — Partial duplicate / split invoice
    if vendor:
        period_invs = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.created_at >= cutoff_30,
            )
        ).all()
        period_total = sum((r.total_aed or 0) for r in period_invs)
        if len(period_invs) >= 2 and abs(period_total - total) < 1.0 and total > 5000:
            flags.append(AnomalyFlag(
                flag_id=4, flag="split_invoice", category="duplicate",
                severity="MEDIUM",
                title="Possible Split Invoice",
                what_is_wrong=f"Combined invoices from {vendor} in last 30 days sum to AED {period_total + total:,.2f}, matching this invoice amount — possible invoice splitting.",
                action_required="Review all invoices from this supplier this period. Confirm each covers a distinct service.",
                uae_law_reference="FTA Compliance — invoice splitting to bypass approval thresholds",
                vat_at_risk_aed=0,
            ))

    # ── CATEGORY 2: VAT COMPLIANCE ─────────────────────────────────────────────

    # ANOMALY 5 — Missing TRN
    if not trn:
        flags.append(AnomalyFlag(
            flag_id=5, flag="missing_trn", category="vat_compliance",
            severity="HIGH",
            title="Missing Supplier TRN",
            what_is_wrong="No Tax Registration Number found on this invoice. Input VAT cannot be reclaimed without a valid supplier TRN.",
            action_required="Request updated invoice from supplier with their 15-digit UAE TRN. Do NOT post to VAT return until resolved.",
            uae_law_reference="Article 59(1), UAE VAT Law — valid tax invoice requires supplier TRN",
            vat_at_risk_aed=round(total * 0.05 / 1.05, 2),
        ))

    # ANOMALY 6 — Invalid TRN format
    elif trn and not UAE_TRN_ANY.match(trn):
        flags.append(AnomalyFlag(
            flag_id=6, flag="invalid_trn_format", category="vat_compliance",
            severity="HIGH",
            title="Invalid TRN Format",
            what_is_wrong=f"TRN '{trn}' does not match UAE format (15 digits starting with 1). This TRN will fail FTA validation.",
            action_required="Request corrected invoice. Verify supplier TRN on FTA portal: https://tax.gov.ae/en/verify.taxpayer.aspx",
            uae_law_reference="Article 59, UAE VAT Law + Cabinet Decision 52/2017",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ANOMALY 7 — VAT amount wrong
    if subtotal > 0 and vat_shown > 0 and vat_treatment == "standard_rated":
        expected_vat = round(subtotal * 0.05, 2)
        variance = abs(vat_shown - expected_vat)
        if variance > 1.0:
            flags.append(AnomalyFlag(
                flag_id=7, flag="vat_amount_wrong", category="vat_compliance",
                severity="HIGH",
                title="Incorrect VAT Amount on Invoice",
                what_is_wrong=f"Invoice shows VAT AED {vat_shown:,.2f} but taxable amount AED {subtotal:,.2f} × 5% = AED {expected_vat:,.2f}. Variance: AED {variance:,.2f}.",
                action_required="Request corrected invoice. FTA requires exact VAT calculation. Claiming wrong amount is an offence.",
                uae_law_reference="Article 65, UAE VAT Law — VAT must be calculated correctly on all tax invoices",
                vat_at_risk_aed=round(variance, 2),
            ))

    # ANOMALY 8 — Wrong VAT treatment
    is_entertainment = any(kw in desc_all for kw in ENTERTAINMENT_KEYWORDS)
    is_exempt_desc = any(kw in desc_all for kw in EXEMPT_KEYWORDS)
    is_zero_desc   = any(kw in desc_all for kw in ZERO_RATED_KEYWORDS)

    if vat_treatment == "standard_rated" and is_exempt_desc:
        flags.append(AnomalyFlag(
            flag_id=8, flag="wrong_vat_treatment", category="vat_compliance",
            severity="HIGH",
            title="Possible Exempt Supply Misclassified as Standard Rated",
            what_is_wrong=f"Description suggests an exempt supply (residential, financial, land) but classified as standard-rated. Incorrectly claiming input VAT on exempt supply.",
            action_required="Refer to UAE VAT specialist. Exempt supplies listed in Article 40, UAE VAT Law.",
            uae_law_reference="Article 40, UAE VAT Law — exempt supplies; Article 54 — no input tax recovery on exempt",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ANOMALY 9 — Reverse charge not applied (foreign supplier)
    if vendor_addr_low and not any(
        uae_city in vendor_addr_low
        for uae_city in ["dubai", "abu dhabi", "sharjah", "ajman", "uae", "u.a.e", "emirates"]
    ) and not trn:
        flags.append(AnomalyFlag(
            flag_id=9, flag="reverse_charge_missing", category="vat_compliance",
            severity="HIGH",
            title="Reverse Charge May Apply — Foreign Supplier",
            what_is_wrong=f"Supplier appears to be outside UAE (address: {extracted.vendor_address or 'not shown'}) with no UAE TRN. Recipient must self-account for VAT under reverse charge mechanism.",
            action_required="Apply reverse charge: account for output VAT (Box 6) and claim input VAT (Box 9) in VAT return. Do not pay supplier VAT.",
            uae_law_reference="Article 48, UAE VAT Law — imported services reverse charge mechanism",
            vat_at_risk_aed=round(subtotal * 0.05, 2),
        ))

    # ANOMALY 10 — Tax period mismatch
    if inv_date:
        today = date.today()
        quarter_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
        if inv_date < quarter_start - timedelta(days=90):
            flags.append(AnomalyFlag(
                flag_id=10, flag="tax_period_mismatch", category="vat_compliance",
                severity="MEDIUM",
                title="Invoice Outside Current VAT Period",
                what_is_wrong=f"Invoice date {inv_date_s} is more than one VAT period ago. Claiming in current return may violate time-of-supply rules.",
                action_required="Verify if this is a late claim. UAE VAT allows claim in next period only. Older claims require FTA voluntary disclosure.",
                uae_law_reference="Article 79, UAE VAT Law — time of supply and input tax period rules",
                vat_at_risk_aed=round(vat_shown, 2),
            ))

    # ANOMALY 11 — Missing mandatory fields
    mandatory_missing = []
    if not vendor: mandatory_missing.append("Supplier name")
    if not extracted.vendor_address: mandatory_missing.append("Supplier address")
    if not trn: mandatory_missing.append("Supplier TRN")
    if not inv_date_s: mandatory_missing.append("Invoice date")
    if not inv_no: mandatory_missing.append("Invoice number")
    if not extracted.customer_name: mandatory_missing.append("Customer name")
    if not extracted.line_items: mandatory_missing.append("Line item description")
    if extracted.vat_amount_aed is None: mandatory_missing.append("VAT amount in AED")
    if extracted.total_aed is None: mandatory_missing.append("Total amount in AED")

    # Remove missing TRN if already flagged
    if "Supplier TRN" in mandatory_missing and any(f.flag_id == 5 for f in flags):
        mandatory_missing.remove("Supplier TRN")

    if mandatory_missing:
        flags.append(AnomalyFlag(
            flag_id=11, flag="missing_mandatory_fields", category="vat_compliance",
            severity="HIGH" if len(mandatory_missing) > 3 else "MEDIUM",
            title=f"Missing Mandatory Invoice Fields ({len(mandatory_missing)})",
            what_is_wrong=f"UAE tax invoice is incomplete. Missing: {', '.join(mandatory_missing)}. FTA may reject VAT input claim.",
            action_required="Request corrected invoice with all mandatory fields. Cannot include in VAT return until complete.",
            uae_law_reference="Article 59(1), UAE VAT Law — mandatory tax invoice fields; AED 5,000 fine per non-compliant invoice",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ── CATEGORY 3: FRAUD PATTERNS ─────────────────────────────────────────────

    # ANOMALY 12 — Invoice splitting (threshold bypass)
    APPROVAL_THRESHOLD = 10_000
    if vendor and total < APPROVAL_THRESHOLD:
        recent_small = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.created_at >= cutoff_7,
            )
        ).all()
        rolling_sum = sum((r.total_aed or 0) for r in recent_small) + total
        if len(recent_small) >= 2 and rolling_sum > APPROVAL_THRESHOLD * 2:
            flags.append(AnomalyFlag(
                flag_id=12, flag="invoice_splitting", category="fraud",
                severity="HIGH",
                title="Invoice Splitting Detected — Threshold Bypass",
                what_is_wrong=f"{len(recent_small)+1} invoices from {vendor} in 7 days all below AED {APPROVAL_THRESHOLD:,.0f} approval threshold. Combined total: AED {rolling_sum:,.2f}. Pattern suggests deliberate splitting.",
                action_required="Escalate to CFO immediately. Consolidate all invoices for senior approval. Investigate supplier relationship.",
                uae_law_reference="Internal controls policy + UAE Companies Law — fraudulent disbursement",
                vat_at_risk_aed=round(rolling_sum * 0.05, 2),
            ))

    # ANOMALY 13 — Round number (estimate risk)
    if total >= 10_000 and total == int(total) and total % 1000 == 0:
        flags.append(AnomalyFlag(
            flag_id=13, flag="round_number", category="fraud",
            severity="MEDIUM",
            title="Suspiciously Round Invoice Amount",
            what_is_wrong=f"Invoice amount AED {total:,.0f} is an exact round number. Legitimate invoices rarely end in exactly .000. May be an estimate rather than actual work completed.",
            action_required="Request supporting timesheet, delivery note, or completion certificate before processing.",
            uae_law_reference="FTA Audit Guide — fabricated invoice indicators",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ANOMALY 14 — Weekend date (UAE: Fri/Sat)
    if inv_date and inv_date.weekday() in (4, 5):  # Friday=4, Saturday=5
        day_name = "Friday" if inv_date.weekday() == 4 else "Saturday"
        flags.append(AnomalyFlag(
            flag_id=14, flag="weekend_date", category="fraud",
            severity="LOW",
            title=f"Invoice Dated on UAE Weekend ({day_name})",
            what_is_wrong=f"Invoice date {inv_date_s} falls on {day_name} (UAE weekend). Businesses are typically closed. May indicate backdating.",
            action_required="Verify actual service delivery date with supplier. Request delivery receipt or email confirmation.",
            uae_law_reference="FTA Audit indicators — backdated invoices",
            vat_at_risk_aed=0,
        ))

    # ANOMALY 15 — Ghost supplier (new + high value + no PO)
    if vendor:
        any_prior = db.query(Invoice).filter(
            and_(Invoice.company_id == company_id, Invoice.vendor_name == vendor)
        ).first()
        has_po = bool(extracted.po_reference)
        if not any_prior and total > 25_000 and not has_po:
            flags.append(AnomalyFlag(
                flag_id=15, flag="ghost_supplier", category="fraud",
                severity="HIGH",
                title="Ghost Supplier Risk — New Vendor, High Value, No PO",
                what_is_wrong=f"First invoice from '{vendor}' for AED {total:,.2f} with no Purchase Order reference. Unverified new supplier presenting high-value invoice is a major fraud risk.",
                action_required="STOP payment. Perform full KYC: verify UAE trade license, confirm bank account independently, check director details. Do not process without signed PO.",
                uae_law_reference="UAE Anti-Money Laundering Law + internal procurement policy",
                vat_at_risk_aed=round(vat_shown, 2),
            ))

    # ANOMALY 16 — Price drift (Mann-Kendall)
    if vendor:
        prior_totals_q = db.query(Invoice.total_aed, Invoice.created_at).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == vendor,
                Invoice.status.in_(["approved", "posted"]),
            )
        ).order_by(Invoice.created_at).limit(20).all()
        prior_amounts = [float(r.total_aed) for r in prior_totals_q if r.total_aed]
        if len(prior_amounts) >= 4:
            mk = _mann_kendall_trend(prior_amounts)
            if mk > 0.6:
                avg = sum(prior_amounts) / len(prior_amounts)
                pct = ((total - avg) / avg * 100) if avg else 0
                flags.append(AnomalyFlag(
                    flag_id=16, flag="price_drift", category="fraud",
                    severity="MEDIUM",
                    title="Systematic Price Creep Detected",
                    what_is_wrong=f"Invoice amounts from {vendor} show consistent upward trend (MK score: {mk:.2f}). Current invoice AED {total:,.2f} is {pct:+.1f}% vs historical average AED {avg:,.2f}.",
                    action_required="Review contract terms. No price increases should occur without formal amendment. Notify procurement.",
                    uae_law_reference="Contract law + procurement policy — unauthorised price variation",
                    vat_at_risk_aed=0,
                ))

    # ANOMALY 17 — Urgency manipulation
    if extracted.payment_terms_days is not None and extracted.payment_terms_days < 5:
        is_new = not db.query(Invoice).filter(
            and_(Invoice.company_id == company_id, Invoice.vendor_name == vendor, Invoice.created_at < cutoff_30)
        ).first()
        severity = "HIGH" if (total > 50_000 and is_new) else "MEDIUM"
        flags.append(AnomalyFlag(
            flag_id=17, flag="urgency_manipulation", category="fraud",
            severity=severity,
            title="Unusually Short Payment Terms — Urgency Pressure",
            what_is_wrong=f"Invoice demands payment within {extracted.payment_terms_days} day(s). Normal commercial terms are 30 days. High-pressure payment requests on large invoices are a fraud indicator.",
            action_required="Do not rush. Apply normal approval process regardless of stated due date. Verify with supplier directly via known contact.",
            uae_law_reference="Internal controls — payment pressure fraud pattern",
            vat_at_risk_aed=0,
        ))

    # ── CATEGORY 4: UAE SPECIFIC ───────────────────────────────────────────────

    # ANOMALY 18 — Entertainment expense (blocked VAT)
    if is_entertainment and vat_shown > 0:
        flags.append(AnomalyFlag(
            flag_id=18, flag="entertainment_blocked_vat", category="uae_specific",
            severity="HIGH",
            title="Entertainment Expense — Input VAT is BLOCKED",
            what_is_wrong=f"Invoice appears to be for entertainment/meals/hospitality (AED {vat_shown:,.2f} VAT claimed). UAE VAT law explicitly blocks input tax recovery on entertainment expenses.",
            action_required="Remove VAT amount AED {vat_shown:,.2f} from VAT return Box 9. Post full amount (inc. VAT) as expense to P&L.",
            uae_law_reference="Article 53(1)(b), UAE VAT Law — blocked input tax on entertainment and meals",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ANOMALY 19 — Free zone supplier
    is_free_zone = any(fz in vendor_addr_low for fz in UAE_FREE_ZONES)
    if is_free_zone:
        flags.append(AnomalyFlag(
            flag_id=19, flag="free_zone_supplier", category="uae_specific",
            severity="MEDIUM",
            title="Free Zone Supplier — Check VAT Treatment",
            what_is_wrong=f"Supplier address indicates a UAE Free Zone. Sales from Free Zone to Mainland UAE may be treated as imports requiring reverse charge VAT, not standard-rated purchases.",
            action_required="Verify supplier's VAT registration status. If QFZP qualified, different rules apply. Consult VAT specialist.",
            uae_law_reference="Cabinet Decision 55/2017 — Free Zone VAT treatment; Article 51, UAE VAT Law",
            vat_at_risk_aed=round(subtotal * 0.05, 2),
        ))

    # ANOMALY 20 — Currency not AED
    if currency != "AED":
        flags.append(AnomalyFlag(
            flag_id=20, flag="non_aed_currency", category="uae_specific",
            severity="MEDIUM",
            title=f"Invoice in {currency} — VAT Must Be Shown in AED",
            what_is_wrong=f"Invoice currency is {currency}. UAE VAT must be calculated and reported in AED using the UAE Central Bank exchange rate on the date of supply.",
            action_required=f"Recalculate VAT in AED using UAE CB rate for {inv_date_s or 'invoice date'}. Request supplier to reissue with AED amounts or provide exchange rate calculation.",
            uae_law_reference="Article 69, UAE VAT Law — reporting currency is AED; Central Bank rate applies",
            vat_at_risk_aed=round(vat_shown, 2),
        ))

    # ── RISK SCORE CALCULATION ─────────────────────────────────────────────────
    score = 0
    weights = {"HIGH": 25, "MEDIUM": 12, "LOW": 4}
    for f in flags:
        score += weights.get(f.severity, 5)
    score = min(score, 100)

    if score >= 60:
        risk_level = "HIGH"
        recommendation = "DO NOT PROCESS. Escalate to Finance Manager immediately. Multiple serious compliance issues detected."
    elif score >= 30:
        risk_level = "MEDIUM"
        recommendation = "HOLD for review. Resolve flagged issues before posting to VAT return or making payment."
    elif score > 0:
        risk_level = "LOW"
        recommendation = "Process with caution. Review flagged items but no critical blockers found."
    else:
        risk_level = "CLEAR"
        recommendation = "All checks passed. Invoice appears compliant — safe to approve and post."

    return RiskResult(
        flags=flags,
        risk_score=score,
        risk_level=risk_level,
        recommendation=recommendation,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    return json.loads(text)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/extract")
def extract_invoice(
    file: UploadFile = File(...),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Extract fields from a PDF or image invoice using Claude vision."""
    if claude_client is None:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    content = file.file.read()
    filename = file.filename or "invoice"
    mime = file.content_type or "application/octet-stream"

    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        extracted_text = ""
        try:
            import pdfplumber, io as _io
            with pdfplumber.open(_io.BytesIO(content)) as pdf:
                extracted_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            pass

        if len(extracted_text.strip()) >= 50:
            user_content = [{"type": "text", "text": f"{EXTRACT_PROMPT}\n\nInvoice text:\n{extracted_text[:5000]}"}]
        else:
            b64 = base64.b64encode(content).decode()
            user_content = [
                {"type": "text", "text": EXTRACT_PROMPT},
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
            ]
    else:
        if mime not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
            mime = "image/jpeg"
        b64 = base64.b64encode(content).decode()
        user_content = [
            {"type": "text", "text": EXTRACT_PROMPT},
            {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}},
        ]

    try:
        msg = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1200,
            temperature=0,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = _extract_json(msg.content[0].text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude extraction failed: {exc}") from exc

    line_items = [
        LineItem(
            description=li.get("description", ""),
            quantity=float(li.get("quantity", 1) or 1),
            unit_price=float(li.get("unit_price", 0) or 0),
            vat_rate=float(li.get("vat_rate", 5) or 5),
        )
        for li in (raw.get("line_items") or [])
    ]

    extracted = ExtractedInvoice(
        vendor_name=raw.get("vendor_name"),
        vendor_address=raw.get("vendor_address"),
        vendor_trn=raw.get("vendor_trn"),
        invoice_number=raw.get("invoice_number"),
        invoice_date=raw.get("invoice_date"),
        customer_name=raw.get("customer_name"),
        customer_address=raw.get("customer_address"),
        customer_trn=raw.get("customer_trn"),
        payment_terms_days=raw.get("payment_terms_days"),
        due_date=raw.get("due_date"),
        po_reference=raw.get("po_reference"),
        currency=raw.get("currency", "AED"),
        line_items=line_items,
        subtotal_aed=raw.get("subtotal_aed"),
        discount_aed=raw.get("discount_aed"),
        vat_amount_aed=raw.get("vat_amount_aed"),
        total_aed=raw.get("total_aed"),
    )

    inv = Invoice(
        company_id=company_id,
        filename=filename,
        vendor_name=extracted.vendor_name,
        vendor_trn=extracted.vendor_trn,
        invoice_number=extracted.invoice_number,
        invoice_date=extracted.invoice_date,
        line_items=[li.model_dump() for li in extracted.line_items],
        subtotal_aed=extracted.subtotal_aed,
        vat_amount_aed=extracted.vat_amount_aed,
        total_aed=extracted.total_aed,
        extracted_json=raw,
        status="pending",
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    return {"invoice_id": inv.id, "extracted": extracted.model_dump(), "filename": filename}


@router.post("/classify-and-risk")
def classify_and_risk(
    payload: ClassifyRiskRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Run VAT classification + all 23 UAE anomaly checks."""
    if claude_client is None:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    inv = db.query(Invoice).filter(
        Invoice.id == payload.invoice_id, Invoice.company_id == company_id
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    ex = payload.extracted
    description = " ".join(li.description for li in ex.line_items) or ex.vendor_name or ""
    amount = ex.total_aed or 0

    # VAT classification
    classify_prompt = f"""You are a UAE VAT expert. Classify this purchase invoice.

Vendor: {ex.vendor_name}
Vendor address: {ex.vendor_address or 'Not shown'}
Vendor TRN: {ex.vendor_trn or 'Not provided'}
Description: {description}
Amount AED: {amount:,.2f}
VAT charged: AED {ex.vat_amount_aed or 0:,.2f}

Return JSON only:
{{
  "vat_treatment": "standard_rated|zero_rated|exempt|out_of_scope|reverse_charge",
  "confidence": 0.0-1.0,
  "article_reference": "Article X, UAE VAT Law",
  "reasoning": "brief explanation"
}}"""

    try:
        msg = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            temperature=0.1,
            messages=[{"role": "user", "content": classify_prompt}],
        )
        vat_result = _extract_json(msg.content[0].text)
    except Exception as exc:
        vat_result = {
            "vat_treatment": "standard_rated",
            "confidence": 0.5,
            "article_reference": "Manual review required",
            "reasoning": f"Classification failed: {exc}",
        }

    # Run all 23 anomaly checks
    risk = run_all_anomaly_checks(ex, company_id, db, vat_result.get("vat_treatment", "standard_rated"))

    # Persist
    inv.vat_treatment = vat_result.get("vat_treatment")
    inv.confidence = vat_result.get("confidence", 0)
    inv.risk_flags = [f.model_dump() for f in risk.flags]
    inv.overall_risk = risk.risk_level.lower()
    inv.status = "review" if risk.risk_level in ("HIGH", "MEDIUM") else "pending"
    db.commit()

    return {
        "invoice_id": inv.id,
        "vat_result": vat_result,
        "risk_flags": [f.model_dump() for f in risk.flags],
        "overall_risk": risk.risk_level,
        "risk_score": risk.risk_score,
        "recommendation": risk.recommendation,
    }


@router.get("/invoices")
def list_invoices(
    status: Optional[str] = None,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    q = db.query(Invoice).filter(Invoice.company_id == company_id)
    if status:
        q = q.filter(Invoice.status == status)
    rows = q.order_by(Invoice.created_at.desc()).limit(100).all()
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "vendor_name": r.vendor_name,
            "vendor_trn": r.vendor_trn,
            "invoice_number": r.invoice_number,
            "invoice_date": r.invoice_date,
            "total_aed": r.total_aed,
            "vat_amount_aed": r.vat_amount_aed,
            "vat_treatment": r.vat_treatment,
            "confidence": r.confidence,
            "risk_flags": r.risk_flags or [],
            "overall_risk": r.overall_risk,
            "status": r.status,
            "reviewed_by": r.reviewed_by,
            "reviewed_at": r.reviewed_at,
            "zoho_bill_id": r.zoho_bill_id,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/invoices/{invoice_id}/review")
def review_invoice(
    invoice_id: int,
    payload: ReviewAction,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(
        Invoice.id == invoice_id, Invoice.company_id == company_id
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.action == "approve":
        inv.status = "approved"
    elif payload.action == "escalate":
        inv.status = "escalated"
    elif payload.action == "override":
        if payload.override_treatment:
            inv.vat_treatment = payload.override_treatment
        inv.status = "approved"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    inv.reviewed_by = payload.reviewed_by
    inv.review_reason = payload.reason
    inv.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)

    return {"invoice_id": inv.id, "status": inv.status, "vat_treatment": inv.vat_treatment}


@router.get("/supplier-profile/{vendor_name}")
def supplier_profile(
    vendor_name: str,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Return AI-built supplier profile from invoice history."""
    invoices = db.query(Invoice).filter(
        and_(
            Invoice.company_id == company_id,
            Invoice.vendor_name == vendor_name,
        )
    ).order_by(Invoice.created_at).all()

    if not invoices:
        return {"vendor_name": vendor_name, "invoice_count": 0, "profile": None}

    amounts = [r.total_aed for r in invoices if r.total_aed]
    avg = sum(amounts) / len(amounts) if amounts else 0
    treatments = [r.vat_treatment for r in invoices if r.vat_treatment]
    most_common_treatment = max(set(treatments), key=treatments.count) if treatments else None

    return {
        "vendor_name": vendor_name,
        "invoice_count": len(invoices),
        "profile": {
            "average_invoice_aed": round(avg, 2),
            "max_invoice_aed": max(amounts) if amounts else 0,
            "min_invoice_aed": min(amounts) if amounts else 0,
            "typical_vat_treatment": most_common_treatment,
            "first_seen": invoices[0].created_at.isoformat() if invoices else None,
            "last_seen": invoices[-1].created_at.isoformat() if invoices else None,
            "price_trend": _mann_kendall_trend(amounts) if len(amounts) >= 3 else None,
        },
    }
