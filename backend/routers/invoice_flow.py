"""Invoice Flow — AI OCR extraction, VAT classification, AP risk engine, review queue."""
import base64
import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from anthropic import Anthropic
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Invoice, Transaction

router = APIRouter(prefix="/api/invoice", tags=["invoice-flow"])

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
claude_client = Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None

UAE_TRN_PATTERN = re.compile(r"^\d{15}$")

EXTRACT_PROMPT = """Extract all fields from this UAE tax invoice and return JSON only (no markdown):
{
  "vendor_name": "",
  "vendor_trn": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "line_items": [{"description": "", "quantity": 0, "unit_price": 0}],
  "subtotal_aed": 0,
  "vat_amount_aed": 0,
  "total_aed": 0,
  "currency": "AED"
}
If a field is not found leave it as null. Return JSON only."""


# ── Pydantic models ────────────────────────────────────────────────────────────

class LineItem(BaseModel):
    description: str = ""
    quantity: float = 1
    unit_price: float = 0


class ExtractedInvoice(BaseModel):
    vendor_name: Optional[str] = None
    vendor_trn: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    line_items: List[LineItem] = []
    subtotal_aed: Optional[float] = None
    vat_amount_aed: Optional[float] = None
    total_aed: Optional[float] = None
    currency: str = "AED"


class ClassifyRiskRequest(BaseModel):
    invoice_id: int
    extracted: ExtractedInvoice


class ReviewAction(BaseModel):
    action: str  # "approve" | "escalate" | "override"
    override_treatment: Optional[str] = None
    reason: Optional[str] = None
    reviewed_by: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    return json.loads(text)


def _run_risk_checks(extracted: ExtractedInvoice, company_id: int, db: Session) -> List[Dict]:
    flags = []

    # 1. Missing TRN
    trn = (extracted.vendor_trn or "").strip()
    if not trn or not UAE_TRN_PATTERN.match(trn):
        flags.append({
            "flag": "missing_trn",
            "severity": "high",
            "message": f"Vendor TRN missing or invalid (expected 15 digits, got: '{trn or 'none'}')",
        })

    # 2. Duplicate invoice
    if extracted.vendor_name and extracted.invoice_number:
        cutoff = datetime.utcnow() - timedelta(days=90)
        dup = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == extracted.vendor_name,
                Invoice.invoice_number == extracted.invoice_number,
                Invoice.created_at >= cutoff,
            )
        ).first()
        if dup:
            flags.append({
                "flag": "duplicate_invoice",
                "severity": "high",
                "message": f"Duplicate: same invoice #{extracted.invoice_number} from {extracted.vendor_name} in last 90 days (ID {dup.id})",
            })

    # 3. Round amount
    total = extracted.total_aed or 0
    if total > 5000 and total == int(total):
        flags.append({
            "flag": "round_amount",
            "severity": "medium",
            "message": f"Amount AED {total:,.0f} is a round number > 5,000 — may be an estimate",
        })

    # 4. Mixed supply
    taxable_kw = {"software", "consulting", "service", "professional", "maintenance", "it ", "cloud"}
    exempt_kw = {"insurance", "residential", "bare land", "financial", "dividend", "interest"}
    if extracted.line_items:
        descs = " ".join(li.description.lower() for li in extracted.line_items)
        has_taxable = any(kw in descs for kw in taxable_kw)
        has_exempt = any(kw in descs for kw in exempt_kw)
        if has_taxable and has_exempt:
            flags.append({
                "flag": "mixed_supply",
                "severity": "medium",
                "message": "Invoice appears to contain both taxable and exempt line items — verify apportionment",
            })

    # 5. New vendor
    one_year_ago = datetime.utcnow() - timedelta(days=365)
    if extracted.vendor_name:
        prior = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == extracted.vendor_name,
                Invoice.created_at < one_year_ago,
            )
        ).first()
        recent = db.query(Invoice).filter(
            and_(
                Invoice.company_id == company_id,
                Invoice.vendor_name == extracted.vendor_name,
            )
        ).first()
        if not prior and not recent:
            flags.append({
                "flag": "new_vendor",
                "severity": "low",
                "message": f"First invoice from '{extracted.vendor_name}' — verify supplier credentials",
            })

    return flags


def _overall_risk(flags: List[Dict]) -> str:
    if not flags:
        return "clear"
    if any(f["severity"] == "high" for f in flags) or len(flags) >= 3:
        return "escalate"
    return "review"


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

    # Build Claude message
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        # Try pdfplumber text extraction first
        extracted_text = ""
        try:
            import pdfplumber, io
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                extracted_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            pass

        if len(extracted_text.strip()) >= 50:
            # Use text mode
            user_content = [
                {"type": "text", "text": f"{EXTRACT_PROMPT}\n\nInvoice text:\n{extracted_text[:4000]}"}
            ]
        else:
            # Fallback: send PDF as base64 document
            b64 = base64.b64encode(content).decode()
            user_content = [
                {"type": "text", "text": EXTRACT_PROMPT},
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
            ]
    else:
        # Image
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
            max_tokens=1000,
            temperature=0,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = _extract_json(msg.content[0].text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude extraction failed: {exc}") from exc

    # Normalise line items
    line_items = [
        LineItem(
            description=li.get("description", ""),
            quantity=float(li.get("quantity", 1) or 1),
            unit_price=float(li.get("unit_price", 0) or 0),
        )
        for li in (raw.get("line_items") or [])
    ]

    extracted = ExtractedInvoice(
        vendor_name=raw.get("vendor_name"),
        vendor_trn=raw.get("vendor_trn"),
        invoice_number=raw.get("invoice_number"),
        invoice_date=raw.get("invoice_date"),
        line_items=line_items,
        subtotal_aed=raw.get("subtotal_aed"),
        vat_amount_aed=raw.get("vat_amount_aed"),
        total_aed=raw.get("total_aed"),
        currency=raw.get("currency", "AED"),
    )

    # Save to DB
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
    """Classify VAT treatment and run AP risk checks on extracted invoice."""
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

    # VAT classification via Claude
    classify_prompt = f"""You are a UAE VAT expert. Classify this purchase invoice for VAT treatment.

Vendor: {ex.vendor_name}
Vendor TRN: {ex.vendor_trn or "Not provided"}
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

    # Risk checks
    risk_flags = _run_risk_checks(ex, company_id, db)
    overall = _overall_risk(risk_flags)

    # Update invoice in DB
    inv.vat_treatment = vat_result.get("vat_treatment")
    inv.confidence = vat_result.get("confidence", 0)
    inv.risk_flags = risk_flags
    inv.overall_risk = overall
    inv.status = "review" if overall in ("review", "escalate") else "pending"
    db.commit()

    return {
        "invoice_id": inv.id,
        "vat_result": vat_result,
        "risk_flags": risk_flags,
        "overall_risk": overall,
    }


@router.get("/invoices")
def list_invoices(
    status: Optional[str] = None,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """List all invoices for the company, optionally filtered by status."""
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
    """Approve, override, or escalate an invoice."""
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
