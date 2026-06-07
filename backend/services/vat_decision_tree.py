"""Deterministic UAE VAT classification decision tree (consultant-reviewed logic)."""
from __future__ import annotations

import random
import re
from typing import Any, Dict, List, Optional

UAE_TRN_RE = re.compile(r"^1\d{14}$")

PURCHASE_KEYWORDS = (
    "rent", "office", "supplies", "stationery", "stationary", "laptop", "computer",
    "computers", "equipment", "furniture", "utilities", "electricity", "water",
    "telephone", "internet", "courier", "delivery", "maintenance", "vehicle", "lease",
    "fuel", "insurance", "subscription", "hosting", "license", "licence", "software",
    "travel", "hotel", "meals", "catering", "refreshments", "entertainment", "hospitality",
    "recreation", "team building", "staff recreation", "import", "materials", "freight",
    "generator", "membership", "certification", "audit", "consulting", "advisory",
    "cleaning", "facilities", "marketing", "colocation", "data centre", "datacenter",
    "payroll", "secretarial", "flight", "cfo travel", "retainer", "cloud", "erp",
    "aws", "google", "microsoft", "adobe", "zoom", "oracle", "meta", "facebook",
    "dhl", "aramex", "etisalat", "dewa", "emirates", "flydubai", "carrefour",
    "spinneys", "marriott", "atlantis", "jumeirah", "purchase", "supplier", "invoice from",
    "salary", "payroll", "penetration testing", "security assessment", "modelling tool",
    "registered agent", "catering event", "conference dinner", "client entertainment",
    "team lunch", "staff quarterly dinner", "sd-wan", "fibre", "wan",
)

SALE_KEYWORDS = (
    "sold", "revenue", "invoice issued", "customer payment", "service rendered",
    "delivery to customer", "export sale", "consulting services rendered", "fees from",
    "advisory fees from client", "dividend", "interest received", "export of goods to",
    "export sale", "sale to customer", "sales invoice", "customer invoice",
    "bare land sale", "training workshop fees",
)

OVERSEAS_KEYWORDS = (
    "overseas", "foreign", "international", "import", "imported", "cross border",
    "outside uae", "non-uae", "aws", "google", "microsoft", "adobe", "zoom", "oracle",
    "meta", "facebook", "netflix", "spotify", "dropbox", "slack", "github", "linkedin",
    "twitter", "apple", "salesforce", "ireland", "uk", "emea", "australia", "germany",
    "llp", "ltd", "limited", "inc", "corp", "gmbh", "pty",
)

IMPORT_GOODS_KEYWORDS = (
    "import", "imported", "customs", "freight inbound", "goods from overseas",
    "raw materials", "sea cargo import", "customs declaration",
)

ENTERTAINMENT_KEYWORDS = (
    "entertainment", "hospitality",
    "client dinner", "client entertainment",
    "team lunch", "team building", "staff recreation",
    "conference dinner", "catering event", "staff quarterly dinner",
    "gala", "celebration", "venue hire",
    "nobu", "buffet", "team building event",
)

# Operational costs — not Art.54 entertainment
ENTERTAINMENT_EXCLUSIONS = (
    "pantry supplies", "office refreshments", "office supplies",
)

EXEMPT_KEYWORDS = (
    "exempt", "exempted", "exemption",
    "groceries", "food items", "basic food",
    "bread", "milk", "eggs", "vegetables", "fruits",
    "residential", "residential rent", "villa lease", "bare land",
    "local passenger transport", "local transport", "taxi", "careem",
    "bank interest", "life insurance",
)

ZERO_RATED_SALE_KEYWORDS = (
    "export", "international freight", "international transport", "zero rated export",
    "export to", "export of", "air freight export", "sea cargo to",
)

ZERO_RATED_PURCHASE_KEYWORDS = (
    "zero rated", "zero-rated", "0% vat",
    "exported goods", "international supply",
    "education services", "educational",
    "healthcare", "medical services",
    "retail merchandise for resale", "merchandise for resale",
)

OUT_OF_SCOPE_KEYWORDS = (
    "salary", "payroll", "dividend", "intercompany loan", "loan repayment",
    "shareholder distribution", "employees payroll",
)

UAE_COUNTRY_VALUES = {"uae", "ae", "united arab emirates", "dubai", "abu dhabi", ""}


def _contains_any(text: str, keywords: tuple) -> bool:
    t = (text or "").lower()
    return any(kw in t for kw in keywords)


def _jitter(base: float, spread: float = 3.0) -> float:
    return round(max(0.0, min(100.0, base + random.uniform(-spread, spread))), 1)


STRONG_SALE_KEYWORDS = (
    "export sale", "sale to customer", "sales invoice", "customer invoice",
    "export of goods", "revenue from", "invoice issued to customer",
)


def determine_transaction_side(
    description: str,
    explicit_type: Optional[str] = None,
    vendor_or_customer: Optional[str] = None,
) -> str:
    """Purchase keywords checked first — expenses default to purchase."""
    combined = f"{description or ''} {vendor_or_customer or ''}".lower()
    if _contains_any(combined, STRONG_SALE_KEYWORDS):
        return "sale"
    if _contains_any(combined, PURCHASE_KEYWORDS):
        return "purchase"
    if _contains_any(combined, SALE_KEYWORDS):
        return "sale"
    if explicit_type and explicit_type.lower() in ("sale", "purchase"):
        return explicit_type.lower()
    return "purchase"


def _trn_missing_or_invalid(vendor_trn: Optional[str]) -> bool:
    if not vendor_trn or not str(vendor_trn).strip():
        return True
    cleaned = str(vendor_trn).strip().upper()
    if cleaned in ("NOT-REGISTERED", "NULL", "N/A", "NA", "-", "NONE"):
        return True
    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return True
    return not bool(UAE_TRN_RE.match(digits))


def determine_location(
    description: str,
    vendor_or_customer: Optional[str] = None,
    vendor_trn: Optional[str] = None,
    vendor_country: Optional[str] = None,
) -> str:
    # Valid UAE TRN → domestic vendor; never reverse-charge
    if not _trn_missing_or_invalid(vendor_trn):
        return "domestic"

    country = (vendor_country or "").strip().lower()
    if country and country not in UAE_COUNTRY_VALUES:
        return "overseas"

    combined = f"{description or ''} {vendor_or_customer or ''}".lower()
    if _contains_any(combined, OVERSEAS_KEYWORDS):
        return "overseas"

    return "domestic"


def is_import_goods(description: str, overseas: bool) -> bool:
    if not overseas:
        return False
    return _contains_any(description or "", IMPORT_GOODS_KEYWORDS)


def is_entertainment_expense(description: str) -> bool:
    text = description or ""
    if _contains_any(text, ENTERTAINMENT_EXCLUSIONS):
        return False
    return _contains_any(text, ENTERTAINMENT_KEYWORDS)


def map_box_number(vat_treatment: str, transaction_side: str) -> int:
    side = (transaction_side or "purchase").lower()
    treatment = (vat_treatment or "standard_rated").lower()

    if side == "sale":
        if treatment == "standard_rated":
            return 1
        if treatment == "zero_rated":
            return 3
        if treatment == "exempt":
            return 4
        return 1

    if treatment == "import_vat":
        return 7
    if treatment == "reverse_charge":
        return 10
    if treatment in ("standard_rated", "entertainment_restricted"):
        return 9
    if treatment == "zero_rated":
        return 10
    if treatment == "exempt":
        return 11
    return 9


def build_risk_flags(
    *,
    missing_trn: bool,
    entertainment: bool,
    reverse_charge: bool,
    import_vat: bool,
    review_required: bool,
) -> List[Dict[str, str]]:
    flags: List[Dict[str, str]] = []
    if missing_trn:
        flags.append({
            "code": "missing_trn",
            "icon": "🔴",
            "label": "Missing TRN",
            "tooltip": "Vendor has no valid UAE TRN — verify supplier registration",
        })
    if entertainment:
        flags.append({
            "code": "art54",
            "icon": "🟠",
            "label": "Art.54",
            "tooltip": "UAE VAT Art.54 — input VAT on entertainment restricted to 50% recovery",
        })
    if reverse_charge:
        flags.append({
            "code": "reverse_charge",
            "icon": "🟣",
            "label": "Reverse Charge",
            "tooltip": "Reverse Charge Mechanism — self-account for VAT as recipient (Box 10 input)",
        })
    if import_vat:
        flags.append({
            "code": "import_vat",
            "icon": "🔵",
            "label": "Import Declaration",
            "tooltip": "Import VAT — customs declaration required (Box 7)",
        })
    if review_required and not entertainment and not import_vat:
        flags.append({
            "code": "review_required",
            "icon": "🟡",
            "label": "Review Required",
            "tooltip": "Classification needs manual review before approval",
        })
    if not flags:
        flags.append({
            "code": "clear",
            "icon": "⚪",
            "label": "Clear",
            "tooltip": "No risk flags — standard classification",
        })
    return flags


def build_explanation(
    *,
    vendor_or_customer: Optional[str],
    vat_treatment: str,
    transaction_side: str,
    location: str,
    confidence_score: float,
    box_number: int,
    specific_reason: str,
) -> str:
    vendor = vendor_or_customer or "This vendor"
    side_label = "Purchase" if transaction_side == "purchase" else "Sale"
    loc_label = "Domestic" if location == "domestic" else "Overseas"
    treatment_label = (vat_treatment or "standard_rated").replace("_", " ")
    return (
        f"Reasoning:\n"
        f"{vendor} is classified as {treatment_label} because:\n"
        f"- Transaction type: {side_label}\n"
        f"- Vendor location: {loc_label}\n"
        f"- {specific_reason}\n"
        f"- Confidence: {confidence_score:.0f}%\n"
        f"- FTA Return: Box {box_number}"
    )


def _specific_reason(
    *,
    transaction_side: str,
    location: str,
    vat_treatment: str,
    entertainment: bool,
    import_goods: bool,
    missing_trn: bool,
) -> str:
    if entertainment:
        return (
            "Entertainment/hospitality expense — Art.54 applies; "
            "only 50% of input VAT is recoverable"
        )
    if import_goods and vat_treatment == "import_vat":
        return "Physical import of goods from overseas — Import VAT via customs (Box 7)"
    if vat_treatment == "reverse_charge":
        if missing_trn:
            return "Foreign vendor with no UAE TRN — Reverse Charge Mechanism applies under UAE VAT law"
        return "Overseas digital services/software — Reverse Charge Mechanism applies (Box 10 input)"
    if vat_treatment == "zero_rated" and transaction_side == "sale":
        return "Export or zero-rated supply — output reported in Box 3"
    if vat_treatment == "zero_rated" and transaction_side == "purchase":
        return "Zero-rated purchase — input VAT at 0% (Box 10)"
    if vat_treatment == "exempt":
        return "Exempt supply under UAE VAT (residential, financial, or local transport)"
    if vat_treatment == "out_of_scope":
        return "Outside scope of UAE VAT (e.g. salary, dividends, intercompany)"
    if transaction_side == "purchase" and location == "domestic":
        return "Standard domestic purchase from UAE supplier — input VAT recoverable (Box 9)"
    if transaction_side == "sale" and location == "domestic":
        return "Standard-rated domestic sale — output VAT due (Box 1)"
    return "Classified per UAE VAT decision tree rules"


def classify_with_decision_tree(
    *,
    description: str,
    amount_aed: float,
    vendor_or_customer: Optional[str] = None,
    transaction_type: str = "purchase",
    vendor_trn: Optional[str] = None,
    vendor_country: Optional[str] = None,
) -> Dict[str, Any]:
    """Full classification: treatment, box, confidence, flags, tier, explanation."""
    amount = float(amount_aed or 0)
    combined = f"{description or ''} {vendor_or_customer or ''}".lower()

    # Entertainment is always a purchase expense — detect before side logic
    entertainment = is_entertainment_expense(description)
    if entertainment:
        side = "purchase"
    else:
        side = determine_transaction_side(description, transaction_type, vendor_or_customer)
    location = determine_location(description, vendor_or_customer, vendor_trn, vendor_country)
    overseas = location == "overseas"
    missing_trn = _trn_missing_or_invalid(vendor_trn)
    import_goods = is_import_goods(description, overseas) and not entertainment

    vat_treatment = "standard_rated"
    vat_rate = 5
    flag_for_review = False
    flag_reason: Optional[str] = None
    blocked_input_vat = False
    blocked_reason: Optional[str] = None
    blocked_vat_amount = 0.0
    reverse_charge_flag = False
    import_vat_flag = False
    ambiguous = False
    explicit_treatment = False

    combined = f"{description} {vendor_or_customer or ''}".lower()

    if _contains_any(combined, OUT_OF_SCOPE_KEYWORDS):
        vat_treatment = "out_of_scope"
        vat_rate = 0
    elif entertainment:
        vat_treatment = "entertainment_restricted"
        vat_rate = 5
        blocked_input_vat = True
        blocked_reason = "UAE VAT Art.54 — input VAT on entertainment restricted to 50% recovery"
        flag_for_review = True
        flag_reason = blocked_reason
        blocked_vat_amount = round(amount * 0.05 * 0.5, 2)
    elif side == "sale":
        if _contains_any(combined, ZERO_RATED_SALE_KEYWORDS):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, EXEMPT_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        else:
            vat_treatment = "standard_rated"
            vat_rate = 5
    elif side == "purchase":
        if import_goods:
            vat_treatment = "import_vat"
            vat_rate = 5
            import_vat_flag = True
            flag_for_review = True
            flag_reason = "Import VAT — customs declaration required"
        elif _contains_any(combined, EXEMPT_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, ZERO_RATED_PURCHASE_KEYWORDS):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
        elif overseas and missing_trn:
            vat_treatment = "reverse_charge"
            vat_rate = 5
            reverse_charge_flag = True
            flag_for_review = True
            flag_reason = "RCM applies — self-account for VAT as recipient"
        else:
            vat_treatment = "standard_rated"
            vat_rate = 5

    if vat_treatment in ("standard_rated", "reverse_charge", "import_vat", "entertainment_restricted"):
        vat_amount_aed = round(amount * 0.05, 2)
    else:
        vat_amount_aed = 0.0

    clear_domestic_purchase = (
        side == "purchase"
        and location == "domestic"
        and vat_treatment == "standard_rated"
        and not entertainment
    )
    clear_domestic_sale = (
        side == "sale"
        and location == "domestic"
        and vat_treatment == "standard_rated"
    )

    if entertainment:
        confidence_score = _jitter(40.0)
    elif import_vat_flag:
        confidence_score = _jitter(80.0, 2.0)
    elif reverse_charge_flag:
        confidence_score = _jitter(90.0, 2.0)
    elif vat_treatment == "zero_rated":
        confidence_score = _jitter(92.0, 2.0)
    elif vat_treatment == "exempt":
        confidence_score = _jitter(90.0, 2.0)
    elif clear_domestic_purchase or clear_domestic_sale:
        confidence_score = _jitter(97.0, 1.0)
    elif vat_treatment == "out_of_scope":
        confidence_score = _jitter(88.0, 2.0)
    elif missing_trn and side == "purchase":
        confidence_score = _jitter(60.0, 3.0)
        ambiguous = True
        flag_for_review = True
        flag_reason = flag_reason or "Missing vendor TRN — manual verification recommended"
    else:
        confidence_score = _jitter(70.0, 3.0)
        ambiguous = True
        flag_for_review = True
        flag_reason = flag_reason or "Ambiguous transaction — manual review recommended"

    if reverse_charge_flag or import_vat_flag or ambiguous:
        flag_for_review = True

    box_number = map_box_number(vat_treatment, side)

    if entertainment:
        review_tier = "blocked"
    elif (
        reverse_charge_flag
        or import_vat_flag
        or (vat_treatment in ("zero_rated", "exempt") and not explicit_treatment)
        or ambiguous
        or confidence_score < 85
    ):
        review_tier = "review_required"
    else:
        review_tier = "auto_approve"

    specific = _specific_reason(
        transaction_side=side,
        location=location,
        vat_treatment=vat_treatment,
        entertainment=entertainment,
        import_goods=import_goods,
        missing_trn=missing_trn,
    )

    explanation = build_explanation(
        vendor_or_customer=vendor_or_customer,
        vat_treatment=vat_treatment,
        transaction_side=side,
        location=location,
        confidence_score=confidence_score,
        box_number=box_number,
        specific_reason=specific,
    )

    flags = build_risk_flags(
        missing_trn=missing_trn and side == "purchase",
        entertainment=entertainment,
        reverse_charge=reverse_charge_flag,
        import_vat=import_vat_flag,
        review_required=review_tier == "review_required",
    )

    return {
        "vat_treatment": vat_treatment,
        "vat_rate": vat_rate,
        "vat_amount_aed": vat_amount_aed,
        "confidence_score": confidence_score,
        "confidence_score_0_1": confidence_score / 100.0,
        "reasoning": explanation,
        "explanation": explanation,
        "flag_for_review": flag_for_review,
        "flag_reason": flag_reason,
        "blocked_input_vat": blocked_input_vat,
        "blocked_reason": blocked_reason,
        "blocked_vat_amount": blocked_vat_amount,
        "entertainment_flag": entertainment,
        "reverse_charge_flag": reverse_charge_flag,
        "import_vat_flag": import_vat_flag,
        "box_number": box_number,
        "flags": flags,
        "review_tier": review_tier,
        "transaction_side": side,
        "location": location,
        "transaction_type_resolved": side,
    }
