"""PDF/Image invoice extraction for VAT Classifier."""
from __future__ import annotations

import base64
import io
import json
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from services.vat_decision_tree import classify_with_decision_tree
from services.vat_enrichment import validate_trn

EXTRACT_PROMPT = """Extract from this UAE invoice:
- vendor_name
- vendor_trn (15-digit TRN if present)
- invoice_number
- invoice_date (YYYY-MM-DD)
- line_items (array of {description, qty, unit_price, amount})
- subtotal_aed
- vat_amount_aed
- total_aed
- currency

Return as JSON only — no markdown, no extra text."""

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
PDF_EXTENSION = ".pdf"
MAX_FILES = 50


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    return json.loads(text)


def _clean_trn(trn: Optional[str]) -> Optional[str]:
    if not trn:
        return None
    cleaned = re.sub(r"\D", "", str(trn).strip())
    return cleaned if cleaned else None


def _parse_invoice_date(raw: Optional[str]) -> date:
    if not raw:
        return date.today()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(raw).strip()[:10], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(str(raw).strip()[:10]).date()
    except ValueError:
        return date.today()


def extract_text_from_file(content: bytes, filename: str) -> Tuple[str, bool]:
    """Extract text from PDF or image. Returns (text, used_ocr)."""
    lower = filename.lower()

    if lower.endswith(PDF_EXTENSION):
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            return text.strip(), False
        except Exception:
            return "", False

    if any(lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
        try:
            import pytesseract
            from PIL import Image

            img = Image.open(io.BytesIO(content))
            text = pytesseract.image_to_string(img)
            return text.strip(), True
        except Exception:
            return "", True

    return "", False


def _build_claude_content(
    content: bytes,
    filename: str,
    mime: str,
    extracted_text: str,
) -> List[Dict[str, Any]]:
    lower = filename.lower()

    if lower.endswith(PDF_EXTENSION):
        if len(extracted_text) >= 50:
            return [
                {
                    "type": "text",
                    "text": f"{EXTRACT_PROMPT}\n\nInvoice text:\n{extracted_text[:8000]}",
                }
            ]
        b64 = base64.b64encode(content).decode()
        return [
            {"type": "text", "text": EXTRACT_PROMPT},
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": b64,
                },
            },
        ]

    if mime not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        if lower.endswith(".png"):
            mime = "image/png"
        elif lower.endswith((".jpg", ".jpeg")):
            mime = "image/jpeg"
        else:
            mime = "image/jpeg"

    if len(extracted_text) >= 30:
        return [
            {
                "type": "text",
                "text": f"{EXTRACT_PROMPT}\n\nOCR text:\n{extracted_text[:8000]}",
            }
        ]

    b64 = base64.b64encode(content).decode()
    return [
        {"type": "text", "text": EXTRACT_PROMPT},
        {
            "type": "image",
            "source": {"type": "base64", "media_type": mime, "data": b64},
        },
    ]


def extract_and_classify_invoice(
    claude_client: Any,
    content: bytes,
    filename: str,
    mime: str = "application/octet-stream",
    entity_type: str = "mainland",
) -> Dict[str, Any]:
    """Extract fields from one invoice file and classify VAT treatment."""
    extracted_text, used_ocr = extract_text_from_file(content, filename)
    flags: List[str] = []
    if used_ocr:
        flags.append("ocr_used")

    try:
        user_content = _build_claude_content(content, filename, mime, extracted_text)
        msg = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1200,
            temperature=0,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = _extract_json(msg.content[0].text)
    except Exception as exc:
        return {
            "file_name": filename,
            "status": "failed",
            "vendor_name": None,
            "vendor_trn": None,
            "trn_valid": False,
            "invoice_number": None,
            "invoice_date": None,
            "total_aed": 0,
            "vat_amount_aed": 0,
            "vat_treatment": None,
            "confidence": 0,
            "flags": flags + ["extraction_failed"],
            "line_items": [],
            "error": str(exc),
        }

    vendor_name = raw.get("vendor_name")
    vendor_trn = _clean_trn(raw.get("vendor_trn"))
    invoice_number = raw.get("invoice_number")
    invoice_date = raw.get("invoice_date")
    line_items = raw.get("line_items") or []
    subtotal = float(raw.get("subtotal_aed") or 0)
    vat_amount = float(raw.get("vat_amount_aed") or 0)
    total_aed = float(raw.get("total_aed") or subtotal + vat_amount or 0)
    currency = raw.get("currency") or "AED"

    trn_result = validate_trn(vendor_trn)
    trn_valid = trn_result["valid"]
    if not vendor_trn:
        flags.append("missing_trn")
    elif not trn_valid:
        flags.append("invalid_trn")

    if total_aed <= 0:
        flags.append("missing_amount")

    descriptions = [
        str(li.get("description", "")).strip()
        for li in line_items
        if li.get("description")
    ]
    description = (
        "; ".join(descriptions[:3])
        if descriptions
        else f"Invoice {invoice_number or filename}"
    )

    classification = classify_with_decision_tree(
        description=description,
        amount_aed=total_aed if total_aed > 0 else subtotal,
        vendor_or_customer=vendor_name,
        transaction_type="purchase",
        vendor_trn=vendor_trn,
    )

    conf = float(classification.get("confidence_score_0_1", 0.85))
    review_tier = classification.get("review_tier", "review_required")

    status = "extracted"
    if review_tier == "review_required" or not trn_valid or conf < 0.7:
        status = "review"
    if total_aed <= 0 and subtotal <= 0:
        status = "failed"
        flags.append("no_amount")

    return {
        "file_name": filename,
        "status": status,
        "vendor_name": vendor_name,
        "vendor_trn": vendor_trn,
        "trn_valid": trn_valid,
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "total_aed": round(total_aed, 2),
        "subtotal_aed": round(subtotal, 2),
        "vat_amount_aed": round(vat_amount, 2),
        "currency": currency,
        "description": description,
        "vat_treatment": classification.get("vat_treatment", "standard_rated"),
        "confidence": round(conf * 100, 1),
        "flags": flags,
        "line_items": line_items,
        "classification": classification,
        "parsed_date": _parse_invoice_date(invoice_date).isoformat(),
        "extracted_json": raw,
    }
