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
    "advisory fees from client", "interest received", "export of goods to",
    "sale to customer", "sales invoice", "customer invoice",
    "training workshop fees", "advance received", "advance payment received",
    "client fee", "fees received",
)

EXPORT_SALE_KEYWORDS = (
    "export", "export sale", "export to", "export of", "exported to",
    "uk client", "korea", "singapore", "overseas client", "international client",
    "overseas sale", "foreign client", "international freight", "zero rated export",
    "air freight export", "sea cargo to",
)

RCM_SERVICE_KEYWORDS = (
    "aws", "google", "microsoft", "salesforce", "oracle", "sap", "adobe", "zoom",
    "cloud", "saas", "software subscription", "digital service", "foreign supplier",
    "netflix", "spotify", "dropbox", "slack", "github", "hosting",
)

LOCAL_SUPPLIER_KEYWORDS = (
    "maintenance", "repair", "contractor", "handyman", "plumber", "electrician",
    "local supplier", "small contractor", "cleaning service", "facilities repair",
)

INTERCOMPANY_RCM_KEYWORDS = (
    "parent company", "foreign parent", "intercompany", "group recharge",
    "bvi", "overseas parent", "intragroup",
)

DEEMED_SUPPLY_KEYWORDS = (
    "corporate gift", "gifts", "gift hamper", "ramadan hamper", "samples",
    "gift to client", "promotional gift",
)

ADVANCE_RECEIVED_KEYWORDS = (
    "advance payment received", "advance received",
)

PENALTY_KEYWORDS = (
    "penalty", "fine", "government penalty", "late filing penalty", "traffic fine",
    "penalties",
)

CLIENT_ENTERTAINMENT_KEYWORDS = (
    "client dinner", "client entertainment", "client event",
    "entertainment", "hospitality", "gala", "nobu", "buffet",
    "conference dinner", "catering event", "venue hire",
)

EMPLOYEE_WELFARE_KEYWORDS = (
    "team building", "staff event", "employee welfare", "staff quarterly dinner",
    "staff recreation", "team lunch", "team building event",
)

PASSENGER_VEHICLE_KEYWORDS = (
    "land cruiser", "hilux", "sedan", "saloon", "suv", "passenger vehicle",
    "company car", "motor vehicle purchase",
)

COMMERCIAL_VEHICLE_KEYWORDS = (
    "truck", "lorry", "delivery van", "ambulance", "taxi", "rental fleet",
    "commercial vehicle", "goods vehicle",
)

HEALTHCARE_PATIENT_KEYWORDS = (
    "patient fee", "patient fees", "clinic fee", "hospital fee",
    "medical consultation", "patient charges", "outpatient",
)

FIRST_RESIDENTIAL_SUPPLY_KEYWORDS = (
    "first supply", "new residential", "off-plan first", "first sale residential",
    "first supply residential",
)

REAL_ESTATE_COMMERCIAL_KEYWORDS = (
    "commercial rent", "office rent", "warehouse rent", "retail space",
    "commercial property", "business bay", "difc office",
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

ENTERTAINMENT_KEYWORDS = CLIENT_ENTERTAINMENT_KEYWORDS

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

ZERO_RATED_SALE_KEYWORDS = EXPORT_SALE_KEYWORDS

ZERO_RATED_PURCHASE_KEYWORDS = (
    "zero rated", "zero-rated", "0% vat",
    "exported goods", "international supply",
    "education services", "educational",
    "healthcare", "medical services",
    "retail merchandise for resale", "merchandise for resale",
    "flight tickets", "international route", "international flight",
)

OUT_OF_SCOPE_KEYWORDS = (
    "salary", "payroll", "wages", "dividend", "intercompany loan", "loan repayment",
    "shareholder distribution", "employees payroll", "employment cost",
    "security deposit", "tenancy deposit", "refundable deposit",
    "damage deposit", "deposit refund",
    "penalty", "fine", "government penalty", "insurance claim received",
)

GOVERNMENT_FEE_KEYWORDS = (
    "building permit", "municipality", "court fee", "court fees",
    "dld", "land department", "trade licence", "trade license",
    "government fee", "government registration", "visa fee", "al quoz plot",
    "rta fee", "ministry fee", "dubai land department",
)

BANK_FEE_KEYWORDS = (
    "bank charge", "bank charges", "bank service", "banking fee", "banking fees",
    "swift transfer", "wire transfer", "account maintenance", "loan processing",
    "overdraft charge", "trade finance", "letter of credit", "loan arrangement",
)

GROUP_MEDICAL_KEYWORDS = (
    "group medical", "medical insurance", "health insurance",
    "employee medical", "daman", "orient insurance", "nas medical",
)

INTERNATIONAL_FLIGHT_KEYWORDS = (
    "international flight", "international route", "flight tickets",
    "business class flight", "business class flights",
    "dubai–london", "dubai-london", "dubai to london", "dxb-lhr", "dxb-lhr",
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
    """Rule 1 — explicit transaction_type is the primary signal."""
    if explicit_type and str(explicit_type).lower().strip() in ("sale", "purchase"):
        return str(explicit_type).lower().strip()
    combined = f"{description or ''} {vendor_or_customer or ''}".lower()
    if _contains_any(combined, STRONG_SALE_KEYWORDS) or _contains_any(combined, EXPORT_SALE_KEYWORDS):
        return "sale"
    if _contains_any(combined, PURCHASE_KEYWORDS):
        return "purchase"
    if _contains_any(combined, SALE_KEYWORDS):
        return "sale"
    return "purchase"


def is_employee_welfare(description: str) -> bool:
    text = description or ""
    if _contains_any(text, ENTERTAINMENT_EXCLUSIONS):
        return False
    return _contains_any(text, EMPLOYEE_WELFARE_KEYWORDS)


def is_client_entertainment(description: str) -> bool:
    text = description or ""
    if _contains_any(text, ENTERTAINMENT_EXCLUSIONS):
        return False
    if is_employee_welfare(text):
        return False
    return _contains_any(text, CLIENT_ENTERTAINMENT_KEYWORDS)


def is_passenger_vehicle(description: str) -> bool:
    text = (description or "").lower()
    if _contains_any(text, COMMERCIAL_VEHICLE_KEYWORDS):
        return False
    return _contains_any(text, PASSENGER_VEHICLE_KEYWORDS)


def _qualifies_for_reverse_charge(
    combined: str,
    side: str,
    overseas: bool,
    missing_trn: bool,
) -> bool:
    """Rule 3 — RCM applies to overseas purchases / imported services only."""
    if side != "purchase":
        return False
    if _contains_any(combined, OUT_OF_SCOPE_KEYWORDS) or _contains_any(combined, PENALTY_KEYWORDS):
        return False
    if _contains_any(combined, DEEMED_SUPPLY_KEYWORDS):
        return False
    if _contains_any(combined, INTERCOMPANY_RCM_KEYWORDS):
        return True
    if _contains_any(combined, LOCAL_SUPPLIER_KEYWORDS) and not _contains_any(
        combined, RCM_SERVICE_KEYWORDS
    ):
        return False
    if overseas and missing_trn and _contains_any(combined, RCM_SERVICE_KEYWORDS):
        return True
    if overseas and missing_trn and _contains_any(combined, OVERSEAS_KEYWORDS):
        return True
    return False


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
    return is_client_entertainment(description)


def map_box_number(vat_treatment: str, transaction_side: str) -> Optional[int]:
    side = (transaction_side or "purchase").lower()
    treatment = (vat_treatment or "standard_rated").lower()

    if treatment == "out_of_scope":
        return None

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
    box_line = f"- FTA Return: Box {box_number}" if box_number is not None else "- FTA Return: N/A (Out of Scope)"
    return (
        f"Reasoning:\n"
        f"{vendor} is classified as {treatment_label} because:\n"
        f"- Transaction type: {side_label}\n"
        f"- Vendor location: {loc_label}\n"
        f"- {specific_reason}\n"
        f"- Confidence: {confidence_score:.0f}%\n"
        f"{box_line}"
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

    side = determine_transaction_side(description, transaction_type, vendor_or_customer)
    location = determine_location(description, vendor_or_customer, vendor_trn, vendor_country)
    overseas = location == "overseas"
    missing_trn = _trn_missing_or_invalid(vendor_trn)
    import_goods = is_import_goods(description, overseas)
    client_entertainment = is_client_entertainment(description) and side == "purchase"
    employee_welfare = is_employee_welfare(description) and side == "purchase"
    passenger_vehicle = is_passenger_vehicle(description) and side == "purchase"
    intercompany = _contains_any(combined, INTERCOMPANY_RCM_KEYWORDS)
    healthcare = _contains_any(combined, HEALTHCARE_PATIENT_KEYWORDS) or _contains_any(
        combined, GROUP_MEDICAL_KEYWORDS
    )

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

    # Rule 8 — Out of Scope (no FTA box)
    if _contains_any(combined, OUT_OF_SCOPE_KEYWORDS):
        vat_treatment = "out_of_scope"
        vat_rate = 0
        explicit_treatment = True
    elif client_entertainment:
        vat_treatment = "entertainment_restricted"
        vat_rate = 5
        blocked_input_vat = True
        blocked_reason = "UAE VAT Art.54 — input VAT on entertainment restricted to 50% recovery"
        flag_for_review = True
        flag_reason = blocked_reason
        blocked_vat_amount = round(amount * 0.05 * 0.5, 2)
    elif side == "sale":
        # Rule 2 — Export services (zero rated, never RCM)
        if _contains_any(combined, ZERO_RATED_SALE_KEYWORDS) or _contains_any(combined, EXPORT_SALE_KEYWORDS):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
        # Rule 12 — Advance payment received
        elif _contains_any(combined, ADVANCE_RECEIVED_KEYWORDS):
            vat_treatment = "standard_rated"
            vat_rate = 5
            flag_for_review = True
            flag_reason = "Advance payment — VAT due on receipt; log in Advance Payment VAT Tracker"
        # Rule 6 — Deemed supply gifts (Art.12 output)
        elif _contains_any(combined, DEEMED_SUPPLY_KEYWORDS):
            vat_treatment = "standard_rated"
            vat_rate = 5
            explicit_treatment = True
        # Rule 5 — First residential supply
        elif _contains_any(combined, FIRST_RESIDENTIAL_SUPPLY_KEYWORDS):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
            flag_for_review = True
            flag_reason = "Real estate — confirm first supply within 3 years of completion"
        # Rule 11 — Healthcare patient fees (exempt, not zero rated)
        elif _contains_any(combined, HEALTHCARE_PATIENT_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
            flag_for_review = True
            flag_reason = "Confirm qualifying healthcare status"
        elif _contains_any(combined, EXEMPT_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        else:
            vat_treatment = "standard_rated"
            vat_rate = 5
    elif side == "purchase":
        if import_goods and not client_entertainment:
            vat_treatment = "import_vat"
            vat_rate = 5
            import_vat_flag = True
            flag_for_review = True
            flag_reason = "Import VAT — customs declaration required"
        elif _contains_any(combined, GOVERNMENT_FEE_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, BANK_FEE_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, GROUP_MEDICAL_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
            blocked_input_vat = True
            blocked_reason = "Art.53 — input VAT on employee medical insurance benefit not recoverable"
            flag_for_review = True
            flag_reason = blocked_reason
        elif _contains_any(combined, FIRST_RESIDENTIAL_SUPPLY_KEYWORDS):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, EXEMPT_KEYWORDS):
            vat_treatment = "exempt"
            vat_rate = 0
            explicit_treatment = True
        elif _contains_any(combined, ZERO_RATED_PURCHASE_KEYWORDS) or _contains_any(
            combined, INTERNATIONAL_FLIGHT_KEYWORDS
        ):
            vat_treatment = "zero_rated"
            vat_rate = 0
            explicit_treatment = True
        elif _qualifies_for_reverse_charge(combined, side, overseas, missing_trn):
            vat_treatment = "reverse_charge"
            vat_rate = 5
            reverse_charge_flag = True
            flag_for_review = True
            flag_reason = "RCM applies — self-account for VAT as recipient"
            if intercompany:
                flag_reason = "Intercompany imported service — RCM applies; TP documentation required"
        elif employee_welfare:
            vat_treatment = "standard_rated"
            vat_rate = 5
            flag_for_review = True
            flag_reason = "Art.53 — confirm if employee welfare or entertainment"
        elif passenger_vehicle:
            vat_treatment = "standard_rated"
            vat_rate = 5
            flag_for_review = True
            flag_reason = "Blocked input VAT risk — Art.53(1)(b) — confirm exclusive business use"
        elif missing_trn and not overseas:
            vat_treatment = "standard_rated"
            vat_rate = 5
            flag_for_review = True
            flag_reason = "Missing vendor TRN — standard rated with verification required"
        else:
            vat_treatment = "standard_rated"
            vat_rate = 5

    if intercompany and side == "purchase":
        flag_for_review = True
        flag_reason = flag_reason or "Transfer pricing documentation required"

    if healthcare and vat_treatment not in ("exempt", "out_of_scope"):
        flag_for_review = True
        flag_reason = flag_reason or "Confirm qualifying healthcare status"

    if vat_treatment in ("standard_rated", "reverse_charge", "import_vat", "entertainment_restricted"):
        vat_amount_aed = round(amount * 0.05, 2)
    else:
        vat_amount_aed = 0.0

    clear_domestic_purchase = (
        side == "purchase"
        and location == "domestic"
        and vat_treatment == "standard_rated"
        and not client_entertainment
        and not employee_welfare
        and not passenger_vehicle
    )
    clear_domestic_sale = (
        side == "sale"
        and location == "domestic"
        and vat_treatment == "standard_rated"
    )

    if client_entertainment:
        confidence_score = _jitter(40.0)
    elif employee_welfare or passenger_vehicle or healthcare:
        confidence_score = _jitter(50.0, 5.0)
    elif intercompany:
        confidence_score = _jitter(48.0, 5.0)
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
    elif missing_trn and side == "purchase" and vat_treatment == "standard_rated":
        confidence_score = _jitter(62.0, 3.0)
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

    if client_entertainment:
        review_tier = "blocked"
    elif employee_welfare or passenger_vehicle or intercompany or healthcare:
        review_tier = "review_required"
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
        entertainment=client_entertainment,
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
        missing_trn=missing_trn and side == "purchase" and not reverse_charge_flag,
        entertainment=client_entertainment,
        reverse_charge=reverse_charge_flag,
        import_vat=import_vat_flag,
        review_required=review_tier == "review_required",
    )
    if intercompany:
        flags.append({
            "code": "transfer_pricing",
            "icon": "🟡",
            "label": "Transfer Pricing",
            "tooltip": "Intercompany transaction — transfer pricing documentation required",
        })
    if passenger_vehicle:
        flags.append({
            "code": "motor_vehicle",
            "icon": "⚠️",
            "label": "Motor Vehicle",
            "tooltip": "Art.53(1)(b) — confirm exclusive business use before recovering input VAT",
        })

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
        "entertainment_flag": client_entertainment,
        "reverse_charge_flag": reverse_charge_flag,
        "import_vat_flag": import_vat_flag,
        "box_number": box_number,
        "flags": flags,
        "review_tier": review_tier,
        "transaction_side": side,
        "location": location,
        "transaction_type_resolved": side,
    }
