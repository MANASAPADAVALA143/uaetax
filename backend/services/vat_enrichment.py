"""Shared VAT enrichment helpers — entertainment, reverse charge, TRN, review tiers."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

UAE_TRN_RE = re.compile(r"^1\d{14}$")

ENTERTAINMENT_KEYWORDS = (
    "entertainment",
    "hospitality",
    "meals",
    "restaurant",
    "hotel",
    "recreation",
    "catering",
    "gala",
    "buffet",
    "leisure",
    "dinner",
    "lunch",
    "cafe",
)

FOREIGN_VENDOR_HINTS = (
    "ltd", "limited", "inc", "corp", "gmbh", "pte", "pvt", "sa", "bv",
    "international", "global", "uk", "usa", "india", "singapore",
)


def validate_trn(trn: Optional[str]) -> Dict[str, bool]:
    """Validate UAE TRN format (15 digits, starts with 1)."""
    if not trn or not str(trn).strip():
        return {"valid": False, "format_check": False}
    cleaned = re.sub(r"\D", "", str(trn).strip())
    ok = bool(UAE_TRN_RE.match(cleaned))
    return {"valid": ok, "format_check": ok}


def is_entertainment(description: Optional[str]) -> bool:
    desc = (description or "").lower()
    return any(kw in desc for kw in ENTERTAINMENT_KEYWORDS)


def is_foreign_vendor(vendor: Optional[str], trn: Optional[str] = None) -> bool:
    """Heuristic: non-UAE TRN or foreign vendor name patterns."""
    if trn:
        cleaned = re.sub(r"\D", "", str(trn).strip())
        if cleaned and not UAE_TRN_RE.match(cleaned):
            return True
    if not vendor:
        return False
    v = vendor.lower()
    return any(h in v for h in FOREIGN_VENDOR_HINTS)


def apply_post_classification_rules(
    classification: Dict[str, Any],
    description: str,
    vendor_or_customer: Optional[str],
    transaction_type: str,
    vendor_trn: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply FinReportAI-style entertainment + reverse charge rules after AI classification."""
    result = dict(classification)
    desc = description or ""
    is_purchase = (transaction_type or "sale").lower() == "purchase"

    if is_purchase and is_entertainment(desc):
        vat = float(result.get("vat_amount_aed") or 0)
        result["blocked_input_vat"] = True
        result["blocked_reason"] = "Art.54 — 50% non-recoverable input VAT (entertainment/hospitality)"
        result["blocked_vat_amount"] = round(vat * 0.5, 2)
        result["entertainment_flag"] = True
        result["flag_for_review"] = True
        result["flag_reason"] = result.get("flag_reason") or "Entertainment expense — partial input VAT block"

    if is_purchase and is_foreign_vendor(vendor_or_customer, vendor_trn):
        if result.get("vat_treatment") not in ("reverse_charge", "zero_rated", "exempt"):
            result["vat_treatment"] = "reverse_charge"
            result["vat_rate"] = 5
            amount = float(result.get("vat_amount_aed") or 0)
            if amount <= 0:
                # reverse charge: self-assess on net if amount known from classification context
                pass
            result["reverse_charge_flag"] = True
            result["flag_for_review"] = True
            result["flag_reason"] = result.get("flag_reason") or "Foreign/non-UAE vendor — reverse charge may apply"

    return result


def review_tier(
    confidence_score_0_100: Optional[float],
    blocked_input_vat: bool = False,
    entertainment_flag: bool = False,
    threshold_0_100: float = 85.0,
) -> str:
    """Classify into auto_approve | review_required | blocked."""
    if blocked_input_vat or entertainment_flag:
        return "blocked"
    conf = confidence_score_0_100 or 0
    if conf >= threshold_0_100:
        return "auto_approve"
    return "review_required"


def enrich_transaction_row(
    txn: Any,
    threshold_0_100: float = 85.0,
) -> Dict[str, Any]:
    """Build enriched dict from a Transaction ORM object."""
    desc = getattr(txn, "description", "") or ""
    vendor = getattr(txn, "vendor_or_customer", None)
    conf = getattr(txn, "confidence_score", None)
    is_purchase = (getattr(txn, "transaction_type", None) or "sale").lower() == "purchase"

    entertainment = is_purchase and is_entertainment(desc)
    rc = is_purchase and is_foreign_vendor(vendor)
    blocked = entertainment  # 50% block treated as blocked tier for review

    tier = review_tier(conf, blocked_input_vat=blocked, entertainment_flag=entertainment, threshold_0_100=threshold_0_100)

    vat_amt = float(getattr(txn, "vat_amount_aed", 0) or 0)
    blocked_vat = round(vat_amt * 0.5, 2) if entertainment else 0.0

    return {
        "id": txn.id,
        "company_id": txn.company_id,
        "date": txn.date.isoformat() if hasattr(txn.date, "isoformat") else str(txn.date),
        "description": desc,
        "vendor_or_customer": vendor,
        "amount_aed": float(txn.amount_aed or 0),
        "vat_treatment": txn.vat_treatment,
        "transaction_type": getattr(txn, "transaction_type", "sale"),
        "vat_amount_aed": vat_amt,
        "confidence_score": conf,
        "is_verified": bool(txn.is_verified),
        "source": getattr(txn, "source", "vat_classifier"),
        "source_invoice_id": getattr(txn, "source_invoice_id", None),
        "entertainment_flag": entertainment,
        "entertainment_label": "50% non-recoverable input VAT" if entertainment else None,
        "reverse_charge_flag": rc,
        "blocked_input_vat": entertainment,
        "blocked_vat_amount": blocked_vat,
        "review_tier": tier,
    }
