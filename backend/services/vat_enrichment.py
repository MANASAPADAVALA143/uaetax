"""Shared VAT enrichment helpers — entertainment, reverse charge, TRN, review tiers."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from services.vat_decision_tree import (
    build_risk_flags,
    classify_with_decision_tree,
    is_entertainment_expense,
    map_box_number,
)

UAE_TRN_RE = re.compile(r"^1\d{14}$")

ENTERTAINMENT_KEYWORDS = (
    "entertainment", "hospitality", "meals", "restaurant", "hotel", "recreation",
    "party", "event", "catering", "dining", "refreshments", "leisure", "team building",
    "team lunch", "client dinner", "staff recreation", "conference dinner", "venue",
    "gala", "celebration", "buffet", "dinner", "lunch", "cafe", "nobu",
)

FOREIGN_VENDOR_HINTS = (
    "ltd", "limited", "inc", "corp", "gmbh", "pte", "pvt", "sa", "bv", "llp",
    "international", "global", "uk", "usa", "india", "singapore", "ireland", "emea",
    "aws", "google", "microsoft", "adobe", "oracle", "salesforce", "slack", "amazon",
)


def validate_trn(trn: Optional[str]) -> Dict[str, bool]:
    """Validate UAE TRN format (15 digits, starts with 1)."""
    if not trn or not str(trn).strip():
        return {"valid": False, "format_check": False}
    cleaned = re.sub(r"\D", "", str(trn).strip())
    ok = bool(UAE_TRN_RE.match(cleaned))
    return {"valid": ok, "format_check": ok}


def is_entertainment(description: Optional[str]) -> bool:
    return is_entertainment_expense(description or "")


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
    vendor_country: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply consultant-reviewed decision tree — overrides AI when rules are clear."""
    amount = float(
        classification.get("amount_aed")
        or classification.get("_amount_aed")
        or 0
    )
    dt = classify_with_decision_tree(
        description=description,
        amount_aed=amount,
        vendor_or_customer=vendor_or_customer,
        transaction_type=transaction_type,
        vendor_trn=vendor_trn,
        vendor_country=vendor_country,
    )
    merged = dict(classification)
    merged.update({
        "vat_treatment": dt["vat_treatment"],
        "vat_rate": dt["vat_rate"],
        "vat_amount_aed": dt["vat_amount_aed"],
        "confidence_score": dt["confidence_score_0_1"],
        "confidence_score_0_100": dt["confidence_score"],
        "reasoning": dt["explanation"],
        "explanation": dt["explanation"],
        "flag_for_review": dt["flag_for_review"],
        "flag_reason": dt["flag_reason"],
        "blocked_input_vat": dt["blocked_input_vat"],
        "blocked_reason": dt["blocked_reason"],
        "blocked_vat_amount": dt["blocked_vat_amount"],
        "entertainment_flag": dt["entertainment_flag"],
        "reverse_charge_flag": dt["reverse_charge_flag"],
        "import_vat_flag": dt["import_vat_flag"],
        "box_number": dt["box_number"],
        "flags": dt["flags"],
        "review_tier": dt["review_tier"],
        "transaction_side": dt["transaction_side"],
        "location": dt["location"],
    })
    return merged


def review_tier(
    confidence_score_0_100: Optional[float],
    blocked_input_vat: bool = False,
    entertainment_flag: bool = False,
    reverse_charge_flag: bool = False,
    import_vat_flag: bool = False,
    threshold_0_100: float = 85.0,
) -> str:
    """Classify into auto_approve | review_required | blocked."""
    if blocked_input_vat or entertainment_flag:
        return "blocked"
    if reverse_charge_flag or import_vat_flag:
        return "review_required"
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
    tx_type = getattr(txn, "transaction_type", None) or "purchase"
    amount = float(getattr(txn, "amount_aed", 0) or 0)
    vat_amt = float(getattr(txn, "vat_amount_aed", 0) or 0)
    stored_flags = getattr(txn, "classification_flags", None)
    stored_box = getattr(txn, "box_number", None)
    stored_reasoning = getattr(txn, "ai_reasoning", None)

    dt = classify_with_decision_tree(
        description=desc,
        amount_aed=amount,
        vendor_or_customer=vendor,
        transaction_type=tx_type,
    )

    resolved_side = dt["transaction_side"]
    treatment = getattr(txn, "vat_treatment", None) or dt["vat_treatment"]
    entertainment = dt["entertainment_flag"]
    rc = dt["reverse_charge_flag"]
    import_vat = dt["import_vat_flag"]
    blocked = entertainment
    box_number = stored_box if stored_box is not None else map_box_number(treatment, resolved_side)

    tier = dt["review_tier"]
    if conf is not None and conf < threshold_0_100 and tier == "auto_approve":
        tier = "review_required"

    explanation = stored_reasoning or dt["explanation"]
    flags: List[Dict[str, str]] = list(stored_flags) if stored_flags else list(dt["flags"])
    missing_trn = any(f.get("code") == "missing_trn" for f in flags)

    if not stored_flags:
        flags = build_risk_flags(
            missing_trn=missing_trn,
            entertainment=entertainment,
            reverse_charge=rc,
            import_vat=import_vat,
            review_required=tier == "review_required",
        )

    blocked_vat = round(vat_amt * 0.5, 2) if entertainment else 0.0

    return {
        "id": txn.id,
        "company_id": txn.company_id,
        "date": txn.date.isoformat() if hasattr(txn.date, "isoformat") else str(txn.date),
        "description": desc,
        "vendor_or_customer": vendor,
        "amount_aed": amount,
        "vat_treatment": treatment,
        "transaction_type": resolved_side,
        "vat_amount_aed": vat_amt,
        "confidence_score": conf if conf is not None else dt["confidence_score"],
        "is_verified": bool(txn.is_verified),
        "source": getattr(txn, "source", "vat_classifier"),
        "source_invoice_id": getattr(txn, "source_invoice_id", None),
        "entertainment_flag": entertainment,
        "entertainment_label": "Art.54 — 50% recovery" if entertainment else None,
        "reverse_charge_flag": rc,
        "import_vat_flag": import_vat,
        "blocked_input_vat": blocked,
        "blocked_vat_amount": blocked_vat,
        "blocked_reason": dt["blocked_reason"] if entertainment else None,
        "review_tier": tier,
        "box_number": box_number,
        "flags": flags,
        "explanation": explanation,
        "ai_reasoning": explanation,
        "flag_reason": dt["flag_reason"],
        "transaction_side": resolved_side,
        "location": dt["location"],
    }
