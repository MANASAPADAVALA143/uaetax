"""E-Invoicing / Peppol PINT AE business logic."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from models import Company, Invoice

UAE_TRN_RE = re.compile(r"^1\d{14}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_VAT_CATEGORIES = {"S", "Z", "E", "AE"}

PHASE_1_REVENUE_THRESHOLD = 50_000_000
PHASE_1_MANDATORY = date(2027, 1, 1)
PHASE_1_ASP_DEADLINE = date(2026, 10, 30)  # Extended from 31 Jul 2026 (10 May 2026)
PHASE_2_MANDATORY = date(2027, 7, 1)
PHASE_2_ASP_DEADLINE = date(2027, 3, 31)
VOLUNTARY_PILOT_START = date(2026, 7, 1)
PEPPOL_5_CORNER_ADOPTED = date(2026, 4, 21)
MONTHLY_NON_COMPLIANCE_PENALTY_AED = 5_000

UBL_NS = {"inv": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"}


def _days_until(target: date) -> int:
    return (target - date.today()).days


def calculate_phase(annual_revenue_aed: float) -> Dict[str, Any]:
    """Determine e-invoicing phase from annual revenue."""
    revenue = max(0.0, float(annual_revenue_aed))
    if revenue >= PHASE_1_REVENUE_THRESHOLD:
        phase = "phase_1"
        phase_label = "Phase 1 — Revenue ≥ AED 50,000,000"
        mandatory_date = PHASE_1_MANDATORY
        asp_deadline = PHASE_1_ASP_DEADLINE
    else:
        phase = "phase_2"
        phase_label = "Phase 2 — Revenue < AED 50,000,000"
        mandatory_date = PHASE_2_MANDATORY
        asp_deadline = PHASE_2_ASP_DEADLINE

    days_to_mandatory = _days_until(mandatory_date)
    days_to_asp = _days_until(asp_deadline)
    days_to_pilot = _days_until(VOLUNTARY_PILOT_START)
    urgency = days_to_asp < 90

    return {
        "phase": phase,
        "phase_label": phase_label,
        "annual_revenue_aed": revenue,
        "mandatory_date": mandatory_date.isoformat(),
        "asp_registration_deadline": asp_deadline.isoformat(),
        "days_to_mandatory": days_to_mandatory,
        "days_to_asp_deadline": days_to_asp,
        "voluntary_pilot_start": VOLUNTARY_PILOT_START.isoformat(),
        "days_to_voluntary_pilot": days_to_pilot,
        "voluntary_pilot_open": days_to_pilot <= 0,
        "peppol_5_corner_adopted": PEPPOL_5_CORNER_ADOPTED.isoformat(),
        "monthly_penalty_aed": MONTHLY_NON_COMPLIANCE_PENALTY_AED,
        "phase_1_asp_deadline_label": "30 October 2026",
        "phase_2_asp_deadline_label": "31 March 2027",
        "urgency_banner": urgency,
        "urgency_message": (
            f"ASP registration deadline in {days_to_asp} days (30 Oct 2026 for Phase 1) — appoint an accredited ASP immediately."
            if urgency and phase == "phase_1"
            else (
                f"ASP registration deadline in {days_to_asp} days — appoint an accredited ASP immediately."
                if urgency
                else None
            )
        ),
    }


def _validate_trn(trn: Optional[str], field_id: str, label: str, b2b_required: bool = False) -> Tuple[Optional[Dict], Optional[Dict], Optional[Dict]]:
    """Return (passed, error, warning) tuples — only one will be set."""
    if not trn or not str(trn).strip():
        if b2b_required:
            return None, {
                "field": field_id,
                "label": label,
                "message": f"{label} is mandatory for B2B invoices.",
                "fix": "Add the buyer's 15-digit UAE TRN starting with 1.",
            }, None
        return None, None, {
            "field": field_id,
            "label": label,
            "message": f"{label} is missing — required for B2B transactions.",
        }

    cleaned = re.sub(r"\D", "", str(trn).strip())
    if not UAE_TRN_RE.match(cleaned):
        return None, {
            "field": field_id,
            "label": label,
            "message": f"{label} must be 15 digits starting with 1 (got '{trn}').",
            "fix": "Verify TRN on FTA portal: https://tax.gov.ae/en/verify.taxpayer.aspx",
        }, None

    return {"field": field_id, "label": label, "value": cleaned}, None, None


def _parse_xml_invoice(xml_content: str) -> Dict[str, Any]:
    """Extract PINT AE fields from UBL XML."""
    root = ET.fromstring(xml_content)
    ns = UBL_NS

    def _text(path: str) -> Optional[str]:
        el = root.find(path, ns)
        return el.text.strip() if el is not None and el.text else None

    def _text_any(*paths: str) -> Optional[str]:
        for p in paths:
            v = _text(p)
            if v:
                return v
        return None

    return {
        "invoice_number": _text_any("inv:ID", ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}ID"),
        "invoice_date": _text_any("inv:IssueDate", ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}IssueDate"),
        "seller_trn": _text_any(
            "inv:AccountingSupplierParty/inv:Party/inv:PartyTaxScheme/inv:CompanyID",
            ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}AccountingSupplierParty//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}CompanyID",
        ),
        "buyer_trn": _text_any(
            "inv:AccountingCustomerParty/inv:Party/inv:PartyTaxScheme/inv:CompanyID",
            ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}AccountingCustomerParty//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}CompanyID",
        ),
        "net_amount": _text_any(
            "inv:LegalMonetaryTotal/inv:TaxExclusiveAmount",
            ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}TaxExclusiveAmount",
        ),
        "vat_amount": _text_any(
            "inv:TaxTotal/inv:TaxAmount",
            ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}TaxAmount",
        ),
        "gross_amount": _text_any(
            "inv:LegalMonetaryTotal/inv:PayableAmount",
            ".//{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}PayableAmount",
        ),
        "vat_category": None,
        "vat_rate": None,
    }


def validate_invoice(
    invoice_number: Optional[str] = None,
    invoice_date: Optional[str] = None,
    seller_trn: Optional[str] = None,
    buyer_trn: Optional[str] = None,
    net_amount: Optional[float] = None,
    vat_amount: Optional[float] = None,
    gross_amount: Optional[float] = None,
    vat_category: Optional[str] = None,
    vat_rate: Optional[float] = None,
    xml_content: Optional[str] = None,
    is_b2b: bool = True,
) -> Dict[str, Any]:
    """Validate invoice against PINT AE mandatory fields."""
    if xml_content:
        try:
            parsed = _parse_xml_invoice(xml_content)
            invoice_number = invoice_number or parsed.get("invoice_number")
            invoice_date = invoice_date or parsed.get("invoice_date")
            seller_trn = seller_trn or parsed.get("seller_trn")
            buyer_trn = buyer_trn or parsed.get("buyer_trn")
            if net_amount is None and parsed.get("net_amount"):
                net_amount = float(parsed["net_amount"])
            if vat_amount is None and parsed.get("vat_amount"):
                vat_amount = float(parsed["vat_amount"])
            if gross_amount is None and parsed.get("gross_amount"):
                gross_amount = float(parsed["gross_amount"])
        except ET.ParseError as exc:
            return {
                "compliance_score": 0,
                "passed": [],
                "errors": [{
                    "field": "xml",
                    "label": "XML file",
                    "message": f"Invalid XML: {exc}",
                    "fix": "Upload a valid UBL 2.1 Invoice XML file.",
                }],
                "warnings": [],
            }

    passed: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    total_checks = 9

    # BT-1
    if invoice_number and str(invoice_number).strip():
        passed.append({"field": "BT-1", "label": "Invoice number", "value": str(invoice_number).strip()})
    else:
        errors.append({
            "field": "BT-1",
            "label": "Invoice number",
            "message": "Invoice number (BT-1) is empty.",
            "fix": "Provide a unique invoice/document number.",
        })

    # BT-2
    if invoice_date and DATE_RE.match(str(invoice_date).strip()):
        passed.append({"field": "BT-2", "label": "Invoice date", "value": invoice_date})
    else:
        errors.append({
            "field": "BT-2",
            "label": "Invoice date",
            "message": "Invoice date (BT-2) must be YYYY-MM-DD format.",
            "fix": "Use ISO date format e.g. 2026-06-01.",
        })

    # BT-31
    p, e, w = _validate_trn(seller_trn, "BT-31", "Seller TRN")
    if p:
        passed.append(p)
    if e:
        errors.append(e)
    if w:
        warnings.append(w)

    # BT-48
    p, e, w = _validate_trn(buyer_trn, "BT-48", "Buyer TRN", b2b_required=is_b2b)
    if p:
        passed.append(p)
    if e:
        errors.append(e)
    if w:
        warnings.append(w)

    # BT-109
    try:
        net = float(net_amount) if net_amount is not None else None
    except (TypeError, ValueError):
        net = None
    if net is not None and net > 0:
        passed.append({"field": "BT-109", "label": "Net amount AED", "value": net})
    else:
        errors.append({
            "field": "BT-109",
            "label": "Net amount AED",
            "message": "Net amount (BT-109) must be greater than zero.",
            "fix": "Enter the tax-exclusive amount in AED.",
        })

    # BT-110
    try:
        vat = float(vat_amount) if vat_amount is not None else None
    except (TypeError, ValueError):
        vat = None
    if vat is not None and vat >= 0:
        passed.append({"field": "BT-110", "label": "VAT amount AED", "value": vat})
    else:
        errors.append({
            "field": "BT-110",
            "label": "VAT amount AED",
            "message": "VAT amount (BT-110) must be zero or positive.",
            "fix": "Enter the VAT amount in AED (0 for zero-rated/exempt).",
        })

    # BT-112
    try:
        gross = float(gross_amount) if gross_amount is not None else None
    except (TypeError, ValueError):
        gross = None
    if net is not None and vat is not None and gross is not None:
        expected = round(net + vat, 2)
        if abs(gross - expected) < 0.02:
            passed.append({"field": "BT-112", "label": "Gross amount AED", "value": gross})
        else:
            errors.append({
                "field": "BT-112",
                "label": "Gross amount AED",
                "message": f"Gross amount ({gross}) must equal net + VAT ({expected:.2f}).",
                "fix": "Recalculate: gross = net amount + VAT amount.",
            })
    elif gross is not None and gross > 0:
        warnings.append({
            "field": "BT-112",
            "label": "Gross amount AED",
            "message": "Could not verify gross = net + VAT — amounts incomplete.",
        })
    else:
        errors.append({
            "field": "BT-112",
            "label": "Gross amount AED",
            "message": "Gross amount (BT-112) is missing or invalid.",
            "fix": "Enter payable amount = net + VAT.",
        })

    # BT-151
    cat = (vat_category or "").strip().upper() if vat_category else ""
    if cat in VALID_VAT_CATEGORIES:
        passed.append({"field": "BT-151", "label": "VAT category code", "value": cat})
    else:
        errors.append({
            "field": "BT-151",
            "label": "VAT category code",
            "message": f"VAT category (BT-151) must be one of S, Z, E, AE (got '{vat_category}').",
            "fix": "S=Standard, Z=Zero-rated, E=Exempt, AE=Reverse charge.",
        })

    # BT-117
    try:
        rate = float(vat_rate) if vat_rate is not None else None
    except (TypeError, ValueError):
        rate = None
    if cat == "S" and rate == 5:
        passed.append({"field": "BT-117", "label": "VAT rate", "value": rate})
    elif cat in ("Z", "E") and rate == 0:
        passed.append({"field": "BT-117", "label": "VAT rate", "value": rate})
    elif cat == "AE" and rate is not None and rate >= 0:
        passed.append({"field": "BT-117", "label": "VAT rate", "value": rate})
        warnings.append({
            "field": "BT-117",
            "label": "VAT rate",
            "message": "Reverse charge (AE) — confirm rate matches self-assessed VAT.",
        })
    else:
        expected = "5 for S, 0 for Z/E"
        errors.append({
            "field": "BT-117",
            "label": "VAT rate",
            "message": f"VAT rate (BT-117) invalid for category {cat or 'unknown'} — expected {expected}.",
            "fix": "Set rate to 5 for standard-rated (S) or 0 for zero-rated/exempt (Z/E).",
        })

    failed = len(errors)
    score = max(0, min(100, round(((total_checks - failed) / total_checks) * 100)))

    return {
        "compliance_score": score,
        "passed": passed,
        "errors": errors,
        "warnings": warnings,
    }


def compute_readiness(db: Session, company_id: int) -> Dict[str, Any]:
    """Run 5 ASP readiness checks for a company."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise ValueError("Company not found")

    checks: List[Dict[str, Any]] = []
    action_items: List[str] = []

    # 1. TRN registered and valid
    trn = (company.trn or "").strip()
    trn_valid = bool(trn and UAE_TRN_RE.match(re.sub(r"\D", "", trn)))
    checks.append({
        "id": "trn_valid",
        "label": "TRN registered and valid",
        "passed": trn_valid,
        "detail": trn if trn_valid else "Missing or invalid TRN format",
    })
    if not trn_valid:
        action_items.append("Register for VAT and add your 15-digit TRN in company settings.")

    # 2. All vendor TRNs on file
    invoices = db.query(Invoice).filter(Invoice.company_id == company_id).all()
    vendor_invoices = [i for i in invoices if i.vendor_name]
    missing_trn = [i for i in vendor_invoices if not i.vendor_trn or not UAE_TRN_RE.match(re.sub(r"\D", "", i.vendor_trn))]
    if not vendor_invoices:
        vendor_trns_ok = True
        vendor_detail = "No vendor invoices on file yet"
    else:
        vendor_trns_ok = len(missing_trn) == 0
        vendor_detail = f"{len(vendor_invoices) - len(missing_trn)}/{len(vendor_invoices)} vendors have TRN"
    checks.append({
        "id": "vendor_trns",
        "label": "All vendor TRNs on file",
        "passed": vendor_trns_ok,
        "detail": vendor_detail,
    })
    if not vendor_trns_ok and missing_trn:
        action_items.append(f"Collect TRNs from {len(missing_trn)} vendor(s) missing TRN data.")

    # 3. Invoice data structured (not PDFs only)
    structured = [i for i in invoices if i.invoice_number and i.total_aed is not None]
    structured_ok = len(structured) > 0 or len(invoices) == 0
    checks.append({
        "id": "structured_data",
        "label": "Invoice data is structured (not PDFs only)",
        "passed": structured_ok,
        "detail": f"{len(structured)} structured invoice(s) on file" if invoices else "No invoices uploaded yet",
    })
    if not structured_ok:
        action_items.append("Import invoices via invoice flow or CSV — avoid PDF-only storage.")

    # 4. Revenue phase determined
    revenue = company.annual_revenue_aed
    phase_ok = revenue is not None and revenue > 0
    phase_info = calculate_phase(revenue or 0) if phase_ok else None
    checks.append({
        "id": "revenue_phase",
        "label": "Revenue phase determined",
        "passed": phase_ok,
        "detail": phase_info["phase_label"] if phase_info else "Annual revenue not set",
    })
    if not phase_ok:
        action_items.append("Enter annual revenue in company profile to determine e-invoicing phase.")

    # 5. ASP provider selected
    asp_ok = bool(company.asp_appointed)
    checks.append({
        "id": "asp_selected",
        "label": "ASP provider selected",
        "passed": asp_ok,
        "detail": "Accredited ASP appointed" if asp_ok else "No ASP appointed yet",
    })
    if not asp_ok:
        action_items.append("Select and appoint an FTA-accredited ASP before the registration deadline.")

    passed_count = sum(1 for c in checks if c["passed"])
    score = round((passed_count / len(checks)) * 100)

    return {
        "company_id": company_id,
        "readiness_score": score,
        "checks": checks,
        "action_items": action_items,
        "phase": phase_info,
    }


def generate_pint_ae_xml(
    invoice_number: str,
    invoice_date: str,
    seller_trn: str,
    buyer_trn: str,
    net_amount: float,
    vat_amount: float,
    gross_amount: float,
) -> str:
    """Generate PINT AE compliant UBL 2.1 Invoice XML."""
    seller = re.sub(r"\D", "", seller_trn)
    buyer = re.sub(r"\D", "", buyer_trn)
    net = f"{net_amount:.2f}"
    vat = f"{vat_amount:.2f}"
    gross = f"{gross_amount:.2f}"

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>{_escape_xml(invoice_number)}</ID>
  <IssueDate>{_escape_xml(invoice_date)}</IssueDate>
  <InvoiceTypeCode>380</InvoiceTypeCode>
  <DocumentCurrencyCode>AED</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party>
      <PartyTaxScheme>
        <CompanyID>{seller}</CompanyID>
      </PartyTaxScheme>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyTaxScheme>
        <CompanyID>{buyer}</CompanyID>
      </PartyTaxScheme>
    </Party>
  </AccountingCustomerParty>
  <TaxTotal>
    <TaxAmount currencyID="AED">{vat}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount currencyID="AED">{net}</TaxExclusiveAmount>
    <PayableAmount currencyID="AED">{gross}</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>"""


def _escape_xml(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
