"""VAT Classification API Router"""
import os
import uuid
import tempfile
import logging
from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ConfigDict
import pandas as pd
import json
from anthropic import Anthropic
from dotenv import load_dotenv
from middleware.auth import get_current_company_id, require_role

# pgvector-backed RAG service — import never fails; returns [] on any error
from services.uae_tax_rag_pg import uae_tax_rag  # type: ignore
from services.vat_decision_tree import classify_with_decision_tree, map_box_number
from services.vat_enrichment import apply_post_classification_rules, enrich_transaction_row
from services.pdf_invoice_extractor import extract_and_classify_invoice, MAX_FILES

from database import get_db
from models import Transaction, Company, AuditLog
from utils.audit import log_ai_audit
from utils.prompt_guard import sanitize_transaction_description
from utils.output_validator import validate_vat_amount

load_dotenv()

logger = logging.getLogger(__name__)


def _get_supabase_client():
    """Reuse the Supabase client from UAETaxRAG when ready; otherwise create one."""
    rag_sb = getattr(uae_tax_rag, "_sb", None)
    if rag_sb is not None:
        return rag_sb
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()
    if not url or not key:
        return None
    try:
        from supabase import create_client  # type: ignore

        return create_client(url, key)
    except Exception as exc:
        logger.warning("Supabase client init failed: %s", exc)
        return None


def _sync_vat_classifications_to_supabase(
    company_id: int,
    transactions: List[Transaction],
    source: str,
) -> None:
    """Best-effort mirror of classified transactions into Supabase vat_classifications."""
    if not transactions:
        return
    sb = _get_supabase_client()
    if not sb:
        return

    for txn in transactions:
        if not txn.id:
            continue
        classified_at = (
            txn.created_at.isoformat()
            if txn.created_at
            else datetime.now(timezone.utc).isoformat()
        )
        row = {
            "company_id": company_id,
            "description": txn.description,
            "amount_aed": float(txn.amount_aed),
            "vat_treatment": txn.vat_treatment,
            "confidence_score": float(txn.confidence_score or 0),
            "classified_at": classified_at,
            "source": source,
            "gulftax_transaction_id": txn.id,
            "status": "classified",
        }
        try:
            sb.table("vat_classifications").upsert(
                row,
                on_conflict="company_id,gulftax_transaction_id",
            ).execute()
        except Exception as exc:
            logger.warning(
                "Supabase vat_classifications upsert failed for txn %s: %s",
                txn.id,
                exc,
            )

router = APIRouter(prefix="/api/vat", tags=["VAT Classification"])
# Classification: POST /classify-transaction (single JSON) and POST /classify-bulk (multipart file) only.

# Temp Excel files from bulk classify (job_id -> absolute path)
_BULK_CLASSIFY_EXCEL_PATHS: Dict[str, str] = {}

# Initialize Claude client (optional at startup — same pattern as vat_return)
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
claude_client = Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None

# uae_tax_rag singleton is imported above; always safe to call


# Pydantic models for request/response
class ClassifyTransactionRequest(BaseModel):
    company_id: int = Field(..., description="Company ID")
    description: str = Field(..., description="Transaction description")
    amount_aed: float = Field(..., gt=0, description="Transaction amount in AED")
    vendor_or_customer: Optional[str] = Field(None, description="Vendor or customer name")
    transaction_type: str = Field(..., pattern="^(sale|purchase)$", description="Transaction type: sale or purchase")
    entity_type: str = Field(..., pattern="^(mainland|free_zone|designated_zone)$", description="Entity type")
    invoice_number: Optional[str] = Field(None, description="Invoice number")
    transaction_date: Optional[date] = Field(None, description="Transaction date")


class ClassificationResult(BaseModel):
    vat_treatment: str
    vat_rate: int
    vat_amount_aed: float
    confidence_score: float
    reasoning: str
    reasoning_detail: Optional[Dict[str, Any]] = None
    flag_for_review: bool
    flag_reason: Optional[str] = None
    uae_law_sources: Optional[List[str]] = None   # doc names used for classification
    blocked_input_vat: bool = False               # Art.53 — input VAT not recoverable
    blocked_reason: Optional[str] = None          # e.g. "Art.53(1)(b) — entertainment"
    blocked_vat_amount: float = 0.0               # VAT amount that is blocked


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    date: date
    description: str
    amount_aed: float
    vendor_or_customer: Optional[str]
    invoice_number: Optional[str]
    vat_treatment: Optional[str]
    transaction_type: str = "sale"
    vat_amount_aed: float
    confidence_score: Optional[float]
    ai_reasoning: Optional[str]
    is_verified: bool
    verification_history: Optional[List[Dict[str, Any]]] = None
    source: Optional[str] = "vat_classifier"
    source_file_name: Optional[str] = None
    vendor_trn: Optional[str] = None
    source_metadata: Optional[Dict[str, Any]] = None
    source_invoice_id: Optional[int] = None
    created_at: datetime


class PatchVerifyTransactionRequest(BaseModel):
    is_verified: bool = Field(True, description="Mark transaction verified or unverified")
    override_treatment: Optional[str] = Field(
        None,
        description="If set, replaces vat_treatment and recalculates VAT amount where applicable",
    )
    note: Optional[str] = Field(None, description="Verification note")


class BulkVerifyRequest(BaseModel):
    transaction_ids: List[int] = Field(..., min_length=1)
    verified_by: str = Field(..., min_length=1)


class BulkApproveHighConfidenceRequest(BaseModel):
    min_confidence: float = Field(0.85, ge=0, le=1, description="Minimum confidence 0-1 scale")
    verified_by: str = Field("user", min_length=1)


class PdfInvoiceItem(BaseModel):
    file_name: str
    status: str
    vendor_name: Optional[str] = None
    vendor_trn: Optional[str] = None
    trn_valid: bool = False
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    parsed_date: Optional[str] = None
    description: Optional[str] = None
    total_aed: float = 0
    subtotal_aed: Optional[float] = None
    vat_amount_aed: float = 0
    currency: Optional[str] = "AED"
    vat_treatment: Optional[str] = None
    confidence: float = 0
    flags: List[str] = Field(default_factory=list)
    line_items: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_json: Optional[Dict[str, Any]] = None
    classification: Optional[Dict[str, Any]] = None


class AddPdfInvoicesRequest(BaseModel):
    invoices: List[PdfInvoiceItem] = Field(..., min_length=1)


def _vat_amount_for_treatment(amount_aed: float, treatment: Optional[str]) -> float:
    if treatment in ("standard_rated", "reverse_charge", "import_vat", "entertainment_restricted"):
        return round(float(amount_aed) * 0.05, 2)
    return 0.0


def _append_validation_warning(classification: Dict[str, Any], amount_aed: float) -> Dict[str, Any]:
    """Flag VAT amount mismatches without blocking save."""
    check = validate_vat_amount(
        amount_aed,
        float(classification.get("vat_amount_aed") or 0),
        str(classification.get("vat_treatment") or "standard_rated"),
    )
    if check.get("valid"):
        return classification
    logger.warning("VAT validation warning: %s", check.get("reason"))
    flags = list(classification.get("flags") or [])
    flags.append(
        {
            "code": "validation_warning",
            "icon": "⚠️",
            "label": "VAT mismatch",
            "tooltip": check.get("reason", "VAT amount does not match treatment"),
        }
    )
    classification["flags"] = flags
    classification["flag_for_review"] = True
    if not classification.get("flag_reason"):
        classification["flag_reason"] = check.get("reason")
    return classification


def _save_classification_fields(
    classification: Dict[str, Any],
    amount_aed: float,
) -> Dict[str, Any]:
    """Normalize classification dict from decision tree or AI+rules."""
    conf_0_100 = classification.get("confidence_score_0_100")
    if conf_0_100 is None:
        raw = classification.get("confidence_score", 0.85)
        conf_0_100 = raw * 100 if raw <= 1 else raw

    return {
        "vat_treatment": classification.get("vat_treatment", "standard_rated"),
        "vat_rate": int(classification.get("vat_rate", 5)),
        "vat_amount_aed": float(
            classification.get("vat_amount_aed")
            or _vat_amount_for_treatment(amount_aed, classification.get("vat_treatment"))
        ),
        "confidence_score_0_100": float(conf_0_100),
        "confidence_score_0_1": float(conf_0_100) / 100.0,
        "reasoning": classification.get("reasoning") if isinstance(classification.get("reasoning"), str) else (
            classification.get("explanation") or ""
        ),
        "reasoning_detail": classification.get("reasoning_detail"),
        "flag_for_review": bool(classification.get("flag_for_review", False)),
        "flag_reason": classification.get("flag_reason"),
        "blocked_input_vat": bool(classification.get("blocked_input_vat", False)),
        "blocked_reason": classification.get("blocked_reason"),
        "blocked_vat_amount": float(classification.get("blocked_vat_amount", 0.0)),
        "box_number": classification.get("box_number"),
        "flags": classification.get("flags") or [],
        "review_tier": classification.get("review_tier", "review_required"),
        "transaction_side": classification.get("transaction_side") or classification.get("transaction_type_resolved", "purchase"),
        "entertainment_flag": bool(classification.get("entertainment_flag", False)),
        "reverse_charge_flag": bool(classification.get("reverse_charge_flag", False)),
        "import_vat_flag": bool(classification.get("import_vat_flag", False)),
    }


def _append_verification_history(transaction: Transaction, entry: Dict[str, Any]) -> None:
    history = list(transaction.verification_history or [])
    entry = {**entry, "at": datetime.now(timezone.utc).isoformat()}
    history.append(entry)
    transaction.verification_history = history


def _parse_tx_type_value(val: Any) -> Optional[str]:
    """Normalize CSV/Excel Type column values to sale or purchase."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    v = str(val).lower().strip()
    if v in ("sale", "sales", "s", "output", "revenue"):
        return "sale"
    if v in ("purchase", "purchases", "p", "input", "expense", "cost"):
        return "purchase"
    if "sale" in v and "purchase" not in v:
        return "sale"
    if "purchase" in v or "expense" in v:
        return "purchase"
    return None


def _resolve_saved_transaction_type(
    raw_row: Optional[Dict[str, Any]] = None,
    *,
    row_tx_type: Optional[str] = None,
    invoice_number: Optional[str] = None,
    default: str = "purchase",
) -> str:
    """Authoritative transaction_type for DB — source Type column, then invoice prefix."""
    type_keys = ("type", "transaction type", "transaction_type", "txn type", "trans type")
    if raw_row:
        for key in type_keys:
            parsed = _parse_tx_type_value(raw_row.get(key))
            if parsed:
                return parsed
        for k, v in raw_row.items():
            if str(k).lower().strip() in type_keys:
                parsed = _parse_tx_type_value(v)
                if parsed:
                    return parsed
    parsed = _parse_tx_type_value(row_tx_type)
    if parsed:
        return parsed
    inv = (invoice_number or "").upper().strip()
    if inv.startswith(("SI-", "IC-", "DS-", "BD-")):
        return "sale"
    if inv.startswith(("PI-", "AP-", "CT-")):
        return "purchase"
    if default in ("sale", "purchase"):
        return default
    return "purchase"


def _find_tx_type_column(df: pd.DataFrame) -> Optional[str]:
    """Find transaction direction column — Type, transaction type, etc."""
    for col in df.columns:
        cl = str(col).lower().strip()
        if cl in ("type", "txn type", "trans type", "transaction type", "transaction_type", "sale/purchase"):
            return col
        if "transaction" in cl and "type" in cl:
            return col
    return None


def _enforce_transaction_direction(
    classification: Dict[str, Any],
    explicit_tx_type: str,
) -> Dict[str, Any]:
    """
    Hard rule: source Type column overrides classifier side and FTA box.
    Sale → boxes 1/3/4 only. Purchase → boxes 7/9/10/11 only.
    """
    side = (explicit_tx_type or "").lower().strip()
    if side not in ("sale", "purchase"):
        return classification

    merged = dict(classification)
    merged["transaction_side"] = side
    merged["transaction_type_resolved"] = side

    treatment = (merged.get("vat_treatment") or "standard_rated").lower()
    if side == "sale" and treatment == "reverse_charge":
        treatment = "standard_rated"
        merged["vat_treatment"] = "standard_rated"
        merged["reverse_charge_flag"] = False

    if side == "sale":
        if treatment == "zero_rated":
            merged["box_number"] = 3
        elif treatment == "exempt":
            merged["box_number"] = 4
        elif treatment == "out_of_scope":
            merged["box_number"] = None
        else:
            merged["box_number"] = 1
            if treatment not in ("zero_rated", "exempt", "out_of_scope"):
                merged["vat_treatment"] = treatment if treatment != "entertainment_restricted" else "standard_rated"
    else:
        if treatment == "reverse_charge" or merged.get("reverse_charge_flag"):
            merged["vat_treatment"] = "reverse_charge"
            merged["box_number"] = 10
        elif treatment == "import_vat" or merged.get("import_vat_flag"):
            merged["box_number"] = 7
        elif treatment == "zero_rated":
            merged["box_number"] = 10
        elif treatment == "exempt":
            merged["box_number"] = 11
        elif treatment == "out_of_scope":
            merged["box_number"] = None
        elif treatment == "entertainment_restricted":
            merged["box_number"] = 9
        else:
            merged["box_number"] = 9

    if merged.get("box_number") is not None:
        merged["box_number"] = map_box_number(
            merged.get("vat_treatment", "standard_rated"),
            side,
        )
        if side == "sale" and merged["box_number"] not in (1, 3, 4):
            merged["box_number"] = {3: 3, 4: 4}.get(
                merged["box_number"], 1
            )
        if side == "purchase" and merged["box_number"] in (1, 3, 4):
            merged["box_number"] = 9

    return merged


_TREATMENT_LABELS = {
    "standard_rated": "Standard Rated",
    "zero_rated": "Zero Rated",
    "exempt": "Exempt",
    "out_of_scope": "Out of Scope",
    "reverse_charge": "Reverse Charge",
    "entertainment_restricted": "Entertainment Restricted",
    "import_vat": "Import VAT",
}

_LAW_REFERENCES = {
    "reverse_charge": "UAE VAT Law Art.48 — Reverse Charge Mechanism",
    "standard_rated": "UAE VAT Law Art.25 — Taxable supplies at 5%",
    "zero_rated": "UAE VAT Law Art.31 — Zero-rated supplies",
    "exempt": "UAE VAT Law Art.42 — Exempt supplies",
    "out_of_scope": "Outside the scope of UAE VAT",
    "entertainment_restricted": "UAE VAT Law Art.53/54 — Entertainment restrictions",
    "import_vat": "UAE VAT Law — Import VAT via customs declaration",
}

_RECOVERY_NOTES = {
    "reverse_charge": (
        "Self-assess output VAT in Box 2. Claim input VAT in Box 9. "
        "Net effect = AED 0 for fully taxable business."
    ),
    "entertainment_restricted": (
        "Input VAT on entertainment is restricted — only 50% recoverable under Art.54."
    ),
    "import_vat": "Import VAT must be declared via customs; recoverable in Box 9 when conditions met.",
    "zero_rated": "Zero-rated supply — 0% VAT; confirm export evidence for sales.",
    "exempt": "Exempt supply — no output VAT; input VAT generally not recoverable.",
    "out_of_scope": "No VAT reporting — transaction is outside UAE VAT scope.",
}


def _parse_ai_reasoning(raw: Optional[Any]) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        return {
            "classification": "See classification",
            "primary_reason": text,
            "evidence": [],
            "uae_law_reference": "",
            "confidence_drivers": [],
            "risk_level": "Medium",
            "recovery_note": None,
            "review_flag": None,
        }
    return None


def _risk_level_from_classification(classification: Dict[str, Any]) -> str:
    conf = float(classification.get("confidence_score_0_100") or 0)
    if classification.get("blocked_input_vat") or classification.get("entertainment_flag"):
        return "High"
    if classification.get("flag_for_review") or conf < 70:
        return "Medium"
    if conf >= 90:
        return "Low"
    return "Medium"


def build_structured_reasoning(
    *,
    description: str,
    vendor_or_customer: Optional[str],
    vendor_trn: Optional[str],
    transaction_type: str,
    classification: Dict[str, Any],
    claude_reasoning: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build full AI reasoning object for storage and Why? panel."""
    treatment = classification.get("vat_treatment", "standard_rated")
    label = _TREATMENT_LABELS.get(treatment, treatment.replace("_", " ").title())
    box = classification.get("box_number")
    fta_box = "N/A" if treatment == "out_of_scope" or box is None else str(box)

    evidence: List[str] = []
    if vendor_trn:
        evidence.append(f"Supplier TRN: {vendor_trn}")
    elif treatment == "reverse_charge":
        evidence.append("Supplier TRN: NOT-REGISTERED")
    if transaction_type:
        evidence.append(f"Transaction type: {transaction_type.title()}")
    if vendor_or_customer:
        evidence.append(f"Party: {vendor_or_customer}")
    desc_lower = (description or "").lower()
    if any(k in desc_lower for k in ("aws", "google", "microsoft", "sap", "s4hana", "saas", "cloud")):
        evidence.append("SaaS/cloud service keyword detected")
    if any(k in desc_lower for k in ("export", "uk client", "overseas client", "international client")):
        evidence.append("Export / overseas client keyword detected")
    if any(k in desc_lower for k in ("insurance premium", "medical insurance", "health insurance")):
        evidence.append("Insurance policy / premium detected (taxable supply)")
    for flag in classification.get("flags") or []:
        if isinstance(flag, dict) and flag.get("label"):
            evidence.append(f"Flag: {flag.get('label')}")

    drivers: List[str] = []
    if treatment == "reverse_charge":
        drivers.extend([
            "✓ Foreign supplier confirmed",
            "✓ Digital/SaaS service detected",
            "✓ No UAE TRN present",
        ])
    elif treatment == "out_of_scope":
        drivers.append("✓ Out of scope keyword matched (salary, dividend, deposit, penalty)")
    elif treatment == "exempt":
        drivers.append("✓ Exempt supply category identified")
    elif treatment == "zero_rated":
        drivers.append("✓ Zero-rated export or qualifying supply identified")
    else:
        drivers.append("✓ Standard UAE VAT rules applied")
    if classification.get("flag_for_review"):
        drivers.append("⚠ Manual review recommended")

    law_ref = _LAW_REFERENCES.get(treatment, "UAE VAT Law — Federal Decree-Law No. 8 of 2017")
    recovery = _RECOVERY_NOTES.get(treatment)
    review_flag = classification.get("flag_reason")
    primary = (
        classification.get("explanation")
        or classification.get("reasoning")
        or f"Classified as {label} per UAE VAT rules."
    )
    if isinstance(primary, dict):
        primary = primary.get("primary_reason", str(primary))

    structured: Dict[str, Any] = {
        "classification": label,
        "primary_reason": str(primary).split("\n")[0][:500],
        "evidence": evidence[:8],
        "uae_law_reference": law_ref,
        "confidence_drivers": drivers[:6],
        "risk_level": _risk_level_from_classification(classification),
        "recovery_note": recovery,
        "review_flag": review_flag,
        "fta_box": fta_box,
        "vat_treatment": treatment,
        "confidence_score": classification.get("confidence_score_0_100"),
    }

    if claude_reasoning and isinstance(claude_reasoning, dict):
        for key in (
            "classification", "primary_reason", "evidence", "uae_law_reference",
            "confidence_drivers", "risk_level", "recovery_note", "review_flag", "fta_box",
        ):
            if claude_reasoning.get(key) not in (None, "", []):
                structured[key] = claude_reasoning[key]
        if claude_reasoning.get("fta_box"):
            structured["fta_box"] = str(claude_reasoning["fta_box"])

    return structured


def _ai_reasoning_json(
    *,
    description: str,
    vendor_or_customer: Optional[str],
    vendor_trn: Optional[str],
    transaction_type: str,
    classification: Dict[str, Any],
    claude_reasoning: Optional[Dict[str, Any]] = None,
) -> str:
    structured = build_structured_reasoning(
        description=description,
        vendor_or_customer=vendor_or_customer,
        vendor_trn=vendor_trn,
        transaction_type=transaction_type,
        classification=classification,
        claude_reasoning=claude_reasoning,
    )
    return json.dumps(structured, ensure_ascii=False)


def _enrich_saved_classification(
    saved: Dict[str, Any],
    *,
    description: str,
    vendor_or_customer: Optional[str],
    vendor_trn: Optional[str],
    transaction_type: str,
    claude_reasoning: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    detail = build_structured_reasoning(
        description=description,
        vendor_or_customer=vendor_or_customer,
        vendor_trn=vendor_trn,
        transaction_type=transaction_type,
        classification=saved,
        claude_reasoning=claude_reasoning,
    )
    saved = dict(saved)
    saved["reasoning_detail"] = detail
    saved["reasoning"] = _ai_reasoning_json(
        description=description,
        vendor_or_customer=vendor_or_customer,
        vendor_trn=vendor_trn,
        transaction_type=transaction_type,
        classification=saved,
        claude_reasoning=claude_reasoning,
    )
    return saved


def classify_with_claude_and_rag(
    description: str,
    amount_aed: float,
    vendor_or_customer: Optional[str],
    transaction_type: str,
    entity_type: str,
    audit_db: Optional[Session] = None,
    audit_company_id: Optional[int] = None,
    audit_actor: str = "system",
) -> Dict[str, Any]:
    """
    Classify transaction using RAG + Claude API.

    Returns classification result with all required fields including rag_citations.
    """
    if claude_client is None:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to backend/.env to use AI classification.",
        )

    description = sanitize_transaction_description(description or "")

    # Retrieve UAE law context from pgvector (never raises)
    rag_context, rag_sources = uae_tax_rag.retrieve_and_format(
        query=f"{description} {transaction_type} {entity_type}",
        law_type="VAT",
    )
    rag_citations: List[str] = rag_sources  # doc names used

    # Step 2: Build Claude prompt with RAG context
    system_prompt = """You are a UAE VAT specialist with deep knowledge of Federal Decree-Law No. 8 of 2017 and FTA clarifications. You classify transactions for UAE VAT returns with precision. Target accuracy: 90%+.

You must return ONLY valid JSON with no additional text, markdown, or code blocks.

━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY ORDER — APPLY IN THIS SEQUENCE
━━━━━━━━━━━━━━━━━━━━━━━━━
1. Determine Sale vs Purchase (Rule 1)
2. Check Out of Scope (Rule 8)
3. Check Export services — Sale only (Rule 2)
4. Check Reverse Charge — Purchase only (Rule 3)
5. Check Government fees / Exempt (Rule 9)
6. Check Financial services exempt (Rule 4)
7. Check Real estate (Rule 5)
8. Check Entertainment / Gifts / Deemed supply (Rule 6)
9. Check Motor vehicles (Rule 7)
10. Check Healthcare (Rule 11)
11. Check Intercompany direction (Rule 10)
12. Check Advance payments received (Rule 12)
13. Default → Standard Rated 5% VAT

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 1 — TRANSACTION DIRECTION (MOST CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━
First determine if this is a SALE or PURCHASE before assigning any VAT treatment.
The transaction_type field is the PRIMARY signal — always respect it.

SALE indicators (output VAT — Boxes 1/3/4):
- transaction_type = "sale" OR "Sale"
- description contains: received, revenue, invoice issued, export, customer,
  client fee, advance received, dividend received (dividend itself is out of scope)
- Result → output supply, assign to Box 1 (standard), Box 3 (zero-rated export), or Box 4 (exempt)

PURCHASE indicators (input VAT — Boxes 9/10/11):
- transaction_type = "purchase" OR "Purchase"
- description contains: paid, supplier, vendor, monthly fee, subscription, annual license
- Result → input supply, assign to Box 9/10/11

NEVER classify a Sale as a Purchase or vice versa.
If type = "Sale" → NEVER apply Reverse Charge (RCM is purchase-only).
If type = "Purchase" → NEVER assign output boxes (Box 1/3/4) unless deemed supply.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 2 — EXPORT SERVICES (Zero Rated)
━━━━━━━━━━━━━━━━━━━━━━━━━
If transaction_type = Sale AND description contains:
export, UK client, Korea, Singapore, overseas client, international client,
exported to, international freight, export sale, legal consulting exported,
exported to UK client, consulting services to UK
→ Zero Rated (Art.31) — NOT Reverse Charge
→ Box 3 (zero-rated supplies)
→ If NOT-REGISTERED vendor + export keywords: confidence_score = 0.55,
  flag_for_review = true, review_flag = "Type mismatch detected — verify this is a Sale not a Purchase"

Reverse Charge is ONLY for overseas PURCHASES, never for overseas SALES.
If vendor is NOT-REGISTERED AND type = Sale AND export/overseas client keywords → Zero Rated, NOT RCM.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 3 — REVERSE CHARGE (overseas purchases only)
━━━━━━━━━━━━━━━━━━━━━━━━━
Apply Reverse Charge ONLY when ALL of these are true:
- transaction_type = Purchase
- vendor TRN = NOT-REGISTERED, blank, or invalid/non-UAE
- description suggests overseas digital/cloud service:
  AWS, Google, Microsoft, Salesforce, Oracle, SAP, S4HANA, SAP cloud, SAP subscription,
  Adobe, Zoom, cloud, SaaS, software subscription, overseas, foreign supplier

For local NOT-REGISTERED vendors (maintenance, repairs, small contractors,
local handyman, local supplier without TRN) → Standard Rated with
🔴 missing TRN flag — NOT Reverse Charge.

NEVER apply Reverse Charge to: penalties, fines, dividends, gifts,
salaries, or any Sale transaction.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 4 — FINANCIAL SERVICES (Exempt)
━━━━━━━━━━━━━━━━━━━━━━━━━
These are Exempt (Art.42), NOT Standard Rated:
- Bank service charges, bank fees, banking fees, SWIFT/wire transfer fees
- Trade finance facility fee, letter of credit fee, loan arrangement fee
- Financial service charge, account maintenance fee, overdraft charge
- Bank interest, currency exchange (margin-based), deposit services

Exception: if VAT is explicitly charged on the invoice amount → Standard Rated
(bank chose to charge VAT on a professional/advisory fee).

DO NOT confuse with PROFESSIONAL SERVICES (always Standard Rated, Art.25):
audit, legal, tax advisory, management consulting, IT consulting, training,
company secretarial — these are NEVER exempt even if from a bank.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 5 — REAL ESTATE SPECIAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━
Residential property — FIRST supply (within 3 years of completion):
→ Zero Rated (Art.30) — NOT Exempt
→ Box 3 for sales

Residential property — subsequent supply / long-term residential rent:
→ Exempt (Art.42 / Art.28)

Commercial property sale or rent (office, warehouse, retail, DIFC, Business Bay):
→ Standard Rated 5% — Box 1 or Box 9

Bare land:
→ Exempt (Art.42)

When description says "first supply", "new residential", or "off-plan first sale"
→ Zero Rated, NOT Exempt.

Set confidence LOW (35-55%) for real estate — first vs subsequent supply is critical.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 6 — ENTERTAINMENT, GIFTS, AND BLOCKED INPUT
━━━━━━━━━━━━━━━━━━━━━━━━━
Entertainment Restricted (Art.53/54) — purchase only:
- Client entertainment, client dinner, client event, hospitality, gala, buffet
- vat_treatment = standard_rated; blocked_input_vat = true
- Confidence LOW (35-45%) — always flag_for_review = true

Employee welfare — MAY be recoverable (do NOT auto-block):
- Staff team building, staff event, employee welfare, staff quarterly dinner
- flag_for_review = true; flag_reason = "Art.53 — confirm if employee welfare or entertainment"
- Do NOT set blocked_input_vat = true automatically

Gifts and deemed supply (Art.12) — SALE output:
- Corporate gifts, Ramadan hampers, samples > AED 500 per person
→ Standard Rated OUTPUT (deemed supply) — Box 1
→ NOT entertainment, NOT reverse charge, NOT purchase

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 7 — MOTOR VEHICLES
━━━━━━━━━━━━━━━━━━━━━━━━━
Passenger motor vehicles (car, SUV, Land Cruiser, Hilux, sedan, saloon):
→ Standard Rated Purchase BUT
→ flag_for_review = true
→ flag_reason = "⚠️ Blocked input VAT risk — Art.53(1)(b) — confirm exclusive business use"
→ confidence_score = 0.55 to 0.60 (force review)

Commercial vehicles (truck, lorry, van for goods, ambulance, taxi, rental fleet):
→ Standard Rated — input VAT recoverable, confidence 85%+

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 8 — OUT OF SCOPE (No FTA Box)
━━━━━━━━━━━━━━━━━━━━━━━━━
These are Out of Scope — assign NO FTA box (fta_box = null or "N/A"):
- Salaries, payroll, wages, employment costs
- Dividends, profit distribution
- Security deposits, refundable deposits, tenancy deposits, damage deposits
- Penalties, fines, government penalties (NOT reverse charge)
- Loan repayments (principal only)
- Insurance claims received

vat_treatment = out_of_scope, vat_rate = 0, vat_amount_aed = 0
NEVER assign Box 1, Box 9, or any other FTA box to Out of Scope items.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 9 — GOVERNMENT FEES
━━━━━━━━━━━━━━━━━━━━━━━━━
Government fees charged by UAE authorities:
Dubai Land Department (DLD), Municipality, Ministry fees, RTA fees,
court fees, building permits, trade licence, visa/immigration government charges
→ Exempt (Art.42), vat_rate = 0
Vendor TRN = GOVERNMENT or government authority name is a strong exempt signal.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 10 — INTERCOMPANY DIRECTION
━━━━━━━━━━━━━━━━━━━━━━━━━
Intercompany transactions:
- Foreign parent charging UAE entity (imported service) → Reverse Charge (purchase)
- UAE entity charging UAE entity → Standard Rated
- Always flag: "⚠️ Transfer pricing documentation required"
- Vendor TRN = NOT-REGISTERED + description contains "parent", "BVI", "overseas",
  "intercompany", "group recharge" → Reverse Charge if purchase

Set confidence LOW (40-55%) for intercompany — need country of supplier.

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 11 — HEALTHCARE VS INSURANCE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━
Medical insurance POLICY / premium (NOT healthcare treatment):
- "medical insurance", "health insurance", "insurance premium", "insurance policy"
- Group medical insurance premium (Daman, Orient, NAS)
→ Standard Rated 5% (insurance is a taxable supply under Art.25)
→ NOT Exempt

Healthcare SERVICES (treatment, consultation — NOT insurance policies):
- "healthcare services", "patient fees", "clinic fees", "hospital treatment", "medical treatment"
- Patient fees to licensed UAE clinic/hospital (Sale by provider) → Exempt (Art.42), NOT Zero Rated
→ Always flag: review_flag = "Confirm qualifying healthcare status"

━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 12 — ADVANCE PAYMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━
If description contains "advance payment received" OR "advance received" AND type = Sale:
→ Standard Rated output, Box 1
→ NOT purchase, NOT reverse charge
→ flag_reason note: "⚡ Advance payment — VAT due on receipt per FTA rule — log in Advance Payment VAT Tracker"

━━━━━━━━━━━━━━━━━━━━━━━━━
ADDITIONAL RULES (ALWAYS APPLY)
━━━━━━━━━━━━━━━━━━━━━━━━━

PROFESSIONAL SERVICES — STANDARD RATED (Art.25):
KPMG, PwC, Deloitte, EY, McKinsey, legal firms, consulting, advisory, training,
penetration testing, registered agent — NEVER exempt.

INSURANCE POLICIES (group medical, health, commercial) → Standard Rated 5% (Art.25).
Only pure life insurance policies → Exempt.

INTERNATIONAL FLIGHTS (purchase) — Zero Rated (Art.34) for international routes.
Domestic UAE-only flights → Standard Rated.

COMMERCIAL PROPERTY RENT — Standard Rated. Residential private rent — Exempt.

━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE SCORING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━
Set confidence LOW (0.35-0.55) for:
- Entertainment, hospitality, gifts
- Motor vehicles (passenger)
- Healthcare
- Real estate (first vs subsequent supply)
- Intercompany (need country of supplier)
- Any transaction where multiple rules could apply

Set confidence HIGH (0.90-0.98) for:
- Clear overseas SaaS/cloud purchase → Reverse Charge
- Clear salary/payroll/dividend → Out of Scope
- Clear government fee → Exempt
- Clear bank charges (no VAT on invoice) → Exempt
- Clear standard rated with valid UAE TRN → Standard Rated
- Clear export sale → Zero Rated Box 3
"""

    context_section = (
        f"Relevant UAE VAT law context:\n{rag_context}"
        if rag_context
        else "No specific UAE law context retrieved — apply general UAE VAT rules."
    )

    user_prompt = f"""Classify this UAE transaction:
Description: {description}
Amount: AED {amount_aed}
Party: {vendor_or_customer if vendor_or_customer else "Not specified"}
Transaction type: {transaction_type}
Transaction direction: {"SALE (output supply — Boxes 1/3/4)" if transaction_type.lower() == "sale" else "PURCHASE (input supply — Boxes 9/10/11)"}
Entity type: {entity_type}

{context_section}

Return JSON only:
{{
  "vat_treatment": "standard_rated|zero_rated|exempt|out_of_scope|reverse_charge",
  "vat_rate": 5 or 0,
  "vat_amount_aed": <calculated float>,
  "confidence_score": <0.0-1.0>,
  "fta_box": "1" or "3" or "9" or "10" or "N/A",
  "flag_for_review": true or false,
  "flag_reason": "reason if flagged, null otherwise",
  "blocked_input_vat": false,
  "blocked_reason": null,
  "blocked_vat_amount": 0.0,
  "reasoning": {{
    "classification": "Reverse Charge",
    "primary_reason": "One clear sentence explaining the classification",
    "evidence": ["Supplier TRN: NOT-REGISTERED", "SaaS keyword detected"],
    "uae_law_reference": "UAE VAT Law Art.48 — Reverse Charge Mechanism",
    "confidence_drivers": ["✓ Foreign supplier confirmed", "✓ Digital service detected"],
    "risk_level": "Low",
    "recovery_note": "Self-assess output VAT in Box 2. Claim input VAT in Box 9.",
    "review_flag": null
  }}
}}"""

    try:
        # Call Claude API
        message = claude_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            temperature=0.1,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        )

        # Extract JSON from response
        response_text = message.content[0].text.strip()
        
        # Try to extract JSON if wrapped in markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Validate and normalize result
        vat_treatment = result.get("vat_treatment", "standard_rated")
        vat_rate = int(result.get("vat_rate", 5))
        vat_amount_aed = float(result.get("vat_amount_aed", amount_aed * vat_rate / 100))
        confidence_score = float(result.get("confidence_score", 0.85))
        raw_reasoning = result.get("reasoning")
        claude_reasoning: Optional[Dict[str, Any]] = None
        reasoning_text = "Classification based on UAE VAT rules"
        if isinstance(raw_reasoning, dict):
            claude_reasoning = raw_reasoning
            reasoning_text = str(raw_reasoning.get("primary_reason") or reasoning_text)
        elif isinstance(raw_reasoning, str) and raw_reasoning.strip():
            reasoning_text = raw_reasoning
        flag_for_review = bool(result.get("flag_for_review", False))
        flag_reason = result.get("flag_reason")
        blocked_input_vat = bool(result.get("blocked_input_vat", False))
        blocked_reason = result.get("blocked_reason")
        blocked_vat_amount = float(result.get("blocked_vat_amount", 0.0))

        normalized = {
            "vat_treatment": vat_treatment,
            "vat_rate": vat_rate,
            "vat_amount_aed": vat_amount_aed,
            "confidence_score": confidence_score,
            "reasoning": reasoning_text,
            "flag_for_review": flag_for_review,
            "flag_reason": flag_reason,
            "blocked_input_vat": blocked_input_vat,
            "blocked_reason": blocked_reason,
            "blocked_vat_amount": blocked_vat_amount,
            "rag_citations": rag_citations,
            "uae_law_sources": rag_sources,
            "_amount_aed": amount_aed,
        }
        final = apply_post_classification_rules(
            normalized,
            description=description,
            vendor_or_customer=vendor_or_customer,
            transaction_type=transaction_type,
        )
        final = _append_validation_warning(final, amount_aed)
        saved_fields = _save_classification_fields(final, amount_aed)
        saved_fields = _enforce_transaction_direction(
            _enrich_saved_classification(
                saved_fields,
                description=description,
                vendor_or_customer=vendor_or_customer,
                vendor_trn=None,
                transaction_type=transaction_type,
                claude_reasoning=claude_reasoning,
            ),
            transaction_type,
        )
        final.update(saved_fields)
        if audit_db is not None:
            try:
                log_ai_audit(
                    audit_db,
                    company_id=audit_company_id,
                    user_email=audit_actor,
                    action_type="ai_call",
                    feature="vat_classifier",
                    input_summary=f"{description[:100]} | AED {amount_aed}",
                    output_summary=(
                        f"Treatment: {final.get('vat_treatment')}, "
                        f"Confidence: {float(final.get('confidence_score', 0) or 0):.0%}"
                    ),
                    status="success",
                )
            except Exception:
                pass
        return final

    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"Response text: {locals().get('response_text', '')}")
        return {
            "vat_treatment": "standard_rated",
            "vat_rate": 5,
            "vat_amount_aed": amount_aed * 0.05,
            "confidence_score": 0.5,
            "reasoning": "Classification failed - defaulting to standard rate. Please review manually.",
            "flag_for_review": True,
            "flag_reason": "AI classification failed - JSON parsing error",
            "blocked_input_vat": False,
            "blocked_reason": None,
            "blocked_vat_amount": 0.0,
            "rag_citations": rag_citations,
            "uae_law_sources": rag_sources,
        }
    except Exception as e:
        print(f"Claude API error: {e}")
        return {
            "vat_treatment": "standard_rated",
            "vat_rate": 5,
            "vat_amount_aed": amount_aed * 0.05,
            "confidence_score": 0.5,
            "reasoning": "Classification failed - defaulting to standard rate. Please review manually.",
            "flag_for_review": True,
            "flag_reason": f"AI classification error: {str(e)}",
            "blocked_input_vat": False,
            "blocked_reason": None,
            "blocked_vat_amount": 0.0,
            "rag_citations": rag_citations,
            "uae_law_sources": rag_sources,
        }


@router.post("/classify-transaction", response_model=ClassificationResult)
async def classify_transaction(
    request: ClassifyTransactionRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Classify a single transaction using RAG + Claude API.
    
    Returns classification result and saves to database.
    """
    # company_id comes from the auth dependency — ignore any company_id in the request body
    # to prevent cross-tenant data access
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Use company's entity type if not provided
    entity_type = request.entity_type or company.entity_type
    
    # Classify transaction
    classification = classify_with_claude_and_rag(
        description=request.description,
        amount_aed=request.amount_aed,
        vendor_or_customer=request.vendor_or_customer,
        transaction_type=request.transaction_type,
        entity_type=entity_type,
        audit_db=db,
        audit_company_id=company_id,
        audit_actor="user",
    )
    saved = _save_classification_fields(classification, request.amount_aed)
    if classification.get("reasoning"):
        saved["reasoning"] = classification["reasoning"]
    if classification.get("reasoning_detail"):
        saved["reasoning_detail"] = classification["reasoning_detail"]
    
    # Save to database — always use the verified company_id from auth
    transaction = Transaction(
        company_id=company_id,
        date=request.transaction_date or date.today(),
        description=request.description,
        amount_aed=request.amount_aed,
        vendor_or_customer=request.vendor_or_customer,
        invoice_number=request.invoice_number,
        vendor_trn=None,
        vat_treatment=saved["vat_treatment"],
        transaction_type=request.transaction_type,
        vat_amount_aed=saved["vat_amount_aed"],
        confidence_score=saved["confidence_score_0_100"],
        ai_reasoning=saved["reasoning"],
        box_number=saved["box_number"],
        classification_flags=saved["flags"],
        is_verified=saved["review_tier"] == "auto_approve",
        source="manual",
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    _sync_vat_classifications_to_supabase(company_id, [transaction], "single")
    
    return ClassificationResult(
        vat_treatment=saved["vat_treatment"],
        vat_rate=saved["vat_rate"],
        vat_amount_aed=saved["vat_amount_aed"],
        confidence_score=saved["confidence_score_0_1"],
        reasoning=(
            saved["reasoning_detail"]["primary_reason"]
            if isinstance(saved.get("reasoning_detail"), dict)
            else saved["reasoning"]
        ),
        reasoning_detail=saved.get("reasoning_detail"),
        flag_for_review=saved["flag_for_review"],
        flag_reason=saved["flag_reason"],
        blocked_input_vat=saved["blocked_input_vat"],
        blocked_reason=saved["blocked_reason"],
        blocked_vat_amount=saved["blocked_vat_amount"],
    )


@router.post("/classify-bulk")
def classify_bulk(
    file: UploadFile = File(...),
    entity_type: str = Query("mainland", pattern="^(mainland|free_zone|designated_zone)$"),
    transaction_type: str = Query("purchase", pattern="^(sale|purchase)$"),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Classify multiple transactions from CSV/Excel file.

    Returns JSON with classifications and a separate URL to download Excel.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    entity_type = entity_type or company.entity_type

    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Missing filename")
        lower = file.filename.lower()
        if lower.endswith(".csv"):
            df = pd.read_csv(file.file)
        elif lower.endswith((".xlsx", ".xls")):
            # Auto-detect header row — scan first 6 rows for one that looks like headers
            raw = pd.read_excel(file.file, engine="openpyxl", header=None)
            header_row = 0
            HEADER_KEYWORDS = {"desc", "amount", "date", "vendor", "supplier", "customer",
                               "invoice", "transaction", "type", "treatment", "notes"}
            for i in range(min(6, len(raw))):
                row_vals = " ".join(str(v).lower() for v in raw.iloc[i].dropna().values)
                hits = sum(1 for kw in HEADER_KEYWORDS if kw in row_vals)
                if hits >= 2:
                    header_row = i
                    break
            df = pd.read_excel(
                raw.to_csv(index=False).encode(),  # re-read from detected header
                header=header_row,
                engine=None,
            ) if False else raw.iloc[header_row + 1:].copy()
            df.columns = [str(v).strip() for v in raw.iloc[header_row].values]
            df = df.reset_index(drop=True)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Please upload CSV or Excel file.",
            )

        df.columns = df.columns.str.strip().str.lower()

        # Drop rows where all values are NaN (title/spacer rows)
        df = df.dropna(how="all").reset_index(drop=True)

        description_col = amount_col = vendor_col = date_col = invoice_col = trn_col = country_col = None
        for col in df.columns:
            col_lower = str(col).lower()
            if "desc" in col_lower:
                description_col = col
            elif col_lower in ("amount aed", "amount_aed", "net amount aed") or (
                "amount" in col_lower and "vat" not in col_lower and "total" not in col_lower
            ):
                amount_col = col
            elif not amount_col and ("value" in col_lower or "total" in col_lower):
                amount_col = col
            if "vendor" in col_lower or "customer" in col_lower or "supplier" in col_lower:
                vendor_col = col
            if col_lower == "date" or col_lower.startswith("date"):
                date_col = col
            if "invoice" in col_lower:
                invoice_col = col
            if col_lower in ("trn", "vendor trn", "supplier trn", "vendor_trn", "tax registration"):
                trn_col = col
            if "country" in col_lower or "vendor country" in col_lower:
                country_col = col

        if not description_col:
            raise HTTPException(status_code=400, detail=f"No description column found. Columns detected: {list(df.columns)}")
        if not amount_col:
            raise HTTPException(status_code=400, detail=f"No amount column found. Columns detected: {list(df.columns)}")

        # Detect transaction direction column (Type, transaction type, etc.)
        tx_type_col = _find_tx_type_column(df)
        has_tx_type_col = tx_type_col is not None

        # ── Build row specs (parse before parallelising) ──────────────────────
        row_specs: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            description = str(row[description_col]) if pd.notna(row[description_col]) else ""
            if not description.strip():
                continue

            row_tx_type = transaction_type
            if has_tx_type_col and tx_type_col is not None:
                parsed_type = _parse_tx_type_value(row.get(tx_type_col))
                if parsed_type:
                    row_tx_type = parsed_type

            amount = float(row[amount_col]) if pd.notna(row[amount_col]) else 0.0
            vendor = str(row[vendor_col]) if vendor_col and pd.notna(row.get(vendor_col, "")) else None
            if date_col and pd.notna(row.get(date_col, "")):
                try:
                    trans_date = pd.to_datetime(row[date_col]).date()
                except Exception:
                    trans_date = date.today()
            else:
                trans_date = date.today()

            invoice_num = (
                str(row[invoice_col]) if invoice_col and pd.notna(row.get(invoice_col, "")) else None
            )
            vendor_trn = (
                str(row[trn_col]).strip()
                if trn_col and pd.notna(row.get(trn_col, ""))
                else None
            )
            vendor_country = (
                str(row[country_col]).strip()
                if country_col and pd.notna(row.get(country_col, ""))
                else None
            )
            row_specs.append({
                "description": description,
                "amount": amount,
                "vendor": vendor,
                "vendor_trn": vendor_trn,
                "vendor_country": vendor_country,
                "trans_date": trans_date,
                "invoice_num": invoice_num,
                "row_tx_type": row_tx_type,
                "raw_row": {str(c): row.get(c) for c in df.columns},
            })

        if not row_specs:
            raise HTTPException(status_code=400, detail="No classifiable rows found in file.")

        # ── Deduplication: skip rows already in DB (same company + invoice_number) ─
        existing_invoice_numbers: set = set()
        candidate_nums = {
            s["invoice_num"] for s in row_specs if s["invoice_num"]
        }
        if candidate_nums:
            existing_rows = (
                db.query(Transaction.invoice_number)
                .filter(
                    Transaction.company_id == company_id,
                    Transaction.invoice_number.in_(candidate_nums),
                )
                .all()
            )
            existing_invoice_numbers = {r.invoice_number for r in existing_rows}

        original_count = len(row_specs)
        row_specs = [
            s for s in row_specs
            if not s["invoice_num"] or s["invoice_num"] not in existing_invoice_numbers
        ]
        skipped_count = original_count - len(row_specs)

        if not row_specs:
            return {
                "job_id": str(uuid.uuid4()),
                "summary": {
                    "total_rows": original_count,
                    "classified_rows": 0,
                    "skipped_duplicates": skipped_count,
                    "needs_review_count": 0,
                    "classifications": [],
                    "message": f"All {skipped_count} rows already exist in the database. No new transactions were added.",
                },
                "excel_download_url": None,
            }

        # ── Classify ALL rows with deterministic decision tree ────────────────
        classifications: List[Dict[str, Any]] = []
        for spec in row_specs:
            raw = classify_with_decision_tree(
                description=spec["description"],
                amount_aed=spec["amount"],
                vendor_or_customer=spec["vendor"],
                transaction_type=spec["row_tx_type"],
                vendor_trn=spec.get("vendor_trn"),
                vendor_country=spec.get("vendor_country"),
            )
            raw = apply_post_classification_rules(
                raw,
                description=spec["description"],
                vendor_or_customer=spec["vendor"],
                transaction_type=spec["row_tx_type"],
                vendor_trn=spec.get("vendor_trn"),
                vendor_country=spec.get("vendor_country"),
            )
            raw = _enforce_transaction_direction(raw, spec["row_tx_type"])
            classifications.append(
                _enrich_saved_classification(
                    _save_classification_fields(raw, spec["amount"]),
                    description=spec["description"],
                    vendor_or_customer=spec["vendor"],
                    vendor_trn=spec.get("vendor_trn"),
                    transaction_type=spec["row_tx_type"],
                )
            )

        # ── Build DB objects and response rows ────────────────────────────────
        db_transactions: List[Transaction] = []
        excel_rows: List[Dict[str, Any]] = []
        per_row_meta: List[Dict[str, Any]] = []

        for spec, classification in zip(row_specs, classifications):
            saved_tx_type = _resolve_saved_transaction_type(
                spec.get("raw_row"),
                row_tx_type=spec["row_tx_type"],
                invoice_number=spec["invoice_num"],
            )
            db_transaction = Transaction(
                company_id=company_id,
                date=spec["trans_date"],
                description=spec["description"],
                amount_aed=spec["amount"],
                vendor_or_customer=spec["vendor"],
                invoice_number=spec["invoice_num"],
                vat_treatment=classification["vat_treatment"],
                transaction_type=saved_tx_type,
                vat_amount_aed=classification["vat_amount_aed"],
                confidence_score=classification["confidence_score_0_100"],
                ai_reasoning=classification["reasoning"],
                box_number=classification["box_number"],
                classification_flags=classification["flags"],
                is_verified=classification["review_tier"] == "auto_approve",
                source="vat_classifier",
            )
            db_transactions.append(db_transaction)

            excel_row = spec["raw_row"].copy()
            excel_row.update(
                {
                    "gulftax_transaction_id": None,
                    "vat_treatment": classification["vat_treatment"],
                    "vat_rate": classification["vat_rate"],
                    "vat_amount_aed": classification["vat_amount_aed"],
                    "box_number": classification["box_number"],
                    "confidence_0_1": classification["confidence_score_0_1"],
                    "reasoning": classification["reasoning"],
                    "needs_review": classification["flag_for_review"],
                    "flag_reason": classification.get("flag_reason"),
                    "review_tier": classification["review_tier"],
                    "transaction_type": saved_tx_type,
                }
            )
            excel_rows.append(excel_row)
            per_row_meta.append(
                {
                    "flag_for_review": classification["flag_for_review"],
                    "review_tier": classification["review_tier"],
                    "vat_rate": float(classification["vat_rate"]),
                    "blocked_input_vat": classification.get("blocked_input_vat", False),
                    "blocked_reason": classification.get("blocked_reason"),
                    "blocked_vat_amount": classification.get("blocked_vat_amount", 0.0),
                    "box_number": classification.get("box_number"),
                    "flags": classification.get("flags") or [],
                }
            )

        db.add_all(db_transactions)
        db.commit()

        for t in db_transactions:
            db.refresh(t)

        _sync_vat_classifications_to_supabase(company_id, db_transactions, "bulk_upload")

        try:
            log_ai_audit(
                db,
                company_id=company_id,
                user_email="user",
                action_type="ai_call",
                feature="vat_classifier",
                input_summary=f"Bulk classified {len(db_transactions)} transactions from {file.filename}",
                output_summary=f"Saved {len(db_transactions)} rows, skipped {skipped_count} duplicates",
                status="success",
            )
        except Exception:
            pass

        job_id = str(uuid.uuid4())
        for t, er in zip(db_transactions, excel_rows):
            er["gulftax_transaction_id"] = t.id

        output_df = pd.DataFrame(excel_rows)
        tmp_dir = tempfile.gettempdir()
        excel_path = os.path.join(tmp_dir, f"gulftax_bulk_classify_{job_id}.xlsx")
        with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
            output_df.to_excel(writer, index=False, sheet_name="Classified Transactions")
        _BULK_CLASSIFY_EXCEL_PATHS[job_id] = excel_path

        classifications_out: List[Dict[str, Any]] = []
        for t, meta, classification in zip(db_transactions, per_row_meta, classifications):
            conf01 = classification["confidence_score_0_1"]
            classifications_out.append(
                {
                    "id": t.id,
                    "description": t.description,
                    "vendor_or_customer": t.vendor_or_customer or "",
                    "amount_aed": float(t.amount_aed),
                    "vat_treatment": t.vat_treatment or "standard_rated",
                    "vat_rate": float(classification["vat_rate"]),
                    "vat_amount_aed": float(t.vat_amount_aed or 0.0),
                    "confidence": conf01,
                    "needs_review": bool(meta["flag_for_review"]),
                    "review_tier": meta.get("review_tier"),
                    "reasoning": t.ai_reasoning or "",
                    "explanation": t.ai_reasoning or "",
                    "box_number": meta.get("box_number"),
                    "flags": meta.get("flags") or [],
                    "blocked_input_vat": bool(meta.get("blocked_input_vat", False)),
                    "blocked_reason": meta.get("blocked_reason"),
                    "blocked_vat_amount": float(meta.get("blocked_vat_amount", 0.0)),
                }
            )

        needs_review_count = sum(1 for c in classifications_out if c["needs_review"])

        return {
            "job_id": job_id,
            "summary": {
                "total_rows": len(df),
                "classified_rows": len(classifications_out),
                "skipped_duplicates": skipped_count,
                "needs_review_count": needs_review_count,
                "classifications": classifications_out,
            },
            "excel_download_url": f"/api/vat/classify-bulk/{job_id}/excel",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/extract-pdf-invoices")
async def extract_pdf_invoices(
    files: List[UploadFile] = File(...),
    entity_type: str = Query("mainland", pattern="^(mainland|free_zone|designated_zone)$"),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Extract and classify up to 50 PDF/image invoices."""
    if claude_client is None:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to backend/.env to use PDF extraction.",
        )

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    entity_type = entity_type or company.entity_type

    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} files per upload")

    allowed_ext = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp"}
    results: List[Dict[str, Any]] = []

    for upload in files:
        filename = upload.filename or "invoice"
        lower = filename.lower()
        if not any(lower.endswith(ext) for ext in allowed_ext):
            results.append({
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
                "flags": ["unsupported_format"],
                "line_items": [],
                "error": "Unsupported file format",
            })
            continue

        content = await upload.read()
        mime = upload.content_type or "application/octet-stream"
        result = extract_and_classify_invoice(
            claude_client,
            content,
            filename,
            mime=mime,
            entity_type=entity_type,
        )
        # Strip internal classification blob from API response (kept for add endpoint)
        results.append(result)

    extracted_count = sum(1 for r in results if r["status"] == "extracted")
    review_count = sum(1 for r in results if r["status"] == "review")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    return {
        "summary": {
            "total": len(results),
            "extracted": extracted_count,
            "review": review_count,
            "failed": failed_count,
        },
        "invoices": results,
    }


@router.post("/add-pdf-invoices")
async def add_pdf_invoices_to_transactions(
    body: AddPdfInvoicesRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Save extracted PDF invoices to the transactions table."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    saved: List[Dict[str, Any]] = []
    skipped = 0
    pdf_transactions: List[Transaction] = []

    for inv in body.invoices:
        if inv.status == "failed":
            skipped += 1
            continue

        amount = float(inv.total_aed or inv.subtotal_aed or 0)
        if amount <= 0:
            skipped += 1
            continue

        classification = inv.classification or {}
        if classification:
            saved_fields = _save_classification_fields(classification, amount)
        else:
            raw = classify_with_decision_tree(
                description=inv.description or f"Invoice {inv.invoice_number or inv.file_name}",
                amount_aed=amount,
                vendor_or_customer=inv.vendor_name,
                transaction_type="purchase",
                vendor_trn=inv.vendor_trn,
            )
            saved_fields = _save_classification_fields(raw, amount)

        trans_date = date.today()
        if inv.parsed_date:
            try:
                trans_date = date.fromisoformat(inv.parsed_date[:10])
            except ValueError:
                pass
        elif inv.invoice_date:
            try:
                trans_date = pd.to_datetime(inv.invoice_date).date()
            except Exception:
                pass

        # Dedup by invoice number
        if inv.invoice_number:
            existing = (
                db.query(Transaction)
                .filter(
                    Transaction.company_id == company_id,
                    Transaction.invoice_number == inv.invoice_number,
                )
                .first()
            )
            if existing:
                skipped += 1
                continue

        metadata = {
            "file_name": inv.file_name,
            "line_items": inv.line_items,
            "extracted_json": inv.extracted_json,
            "flags": inv.flags,
            "currency": inv.currency,
            "trn_valid": inv.trn_valid,
        }

        txn = Transaction(
            company_id=company_id,
            date=trans_date,
            description=inv.description or f"Invoice {inv.invoice_number or inv.file_name}",
            amount_aed=amount,
            vendor_or_customer=inv.vendor_name,
            vendor_trn=inv.vendor_trn,
            invoice_number=inv.invoice_number,
            vat_treatment=saved_fields["vat_treatment"],
            transaction_type=saved_fields.get("transaction_side", "purchase"),
            vat_amount_aed=float(inv.vat_amount_aed or saved_fields["vat_amount_aed"]),
            confidence_score=float(inv.confidence or saved_fields["confidence_score_0_100"]),
            ai_reasoning=saved_fields["reasoning"],
            box_number=saved_fields["box_number"],
            classification_flags=saved_fields["flags"],
            is_verified=saved_fields["review_tier"] == "auto_approve",
            source="pdf_invoice",
            source_file_name=inv.file_name,
            source_metadata=metadata,
        )
        db.add(txn)
        db.flush()
        pdf_transactions.append(txn)
        saved.append({"id": txn.id, "file_name": inv.file_name, "invoice_number": inv.invoice_number})

    if saved:
        db.add(
            AuditLog(
                company_id=company_id,
                actor="user",
                action="add_pdf_invoices",
                entity=f"{len(saved)} transactions from PDF invoices",
            )
        )
    db.commit()
    _sync_vat_classifications_to_supabase(company_id, pdf_transactions, "bulk_upload")

    return {
        "saved_count": len(saved),
        "skipped_count": skipped,
        "transactions": saved,
    }


@router.get("/classify-bulk/{job_id}/excel")
async def download_classify_bulk_excel(job_id: str):
    path = _BULK_CLASSIFY_EXCEL_PATHS.get(job_id)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Excel export not found or expired")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"vat_classifications_{job_id}.xlsx",
    )


@router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    period_start: Optional[date] = Query(None, description="Filter by period start date"),
    period_end: Optional[date] = Query(None, description="Filter by period end date"),
    vat_treatment: Optional[str] = Query(None, description="Filter by VAT treatment"),
    flag_for_review: Optional[bool] = Query(None, description="Filter by flag_for_review status"),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Get all classified transactions for a company with optional filters.
    """
    # company_id already verified by auth dep
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Build query — always filter by the verified company_id
    query = db.query(Transaction).filter(Transaction.company_id == company_id)
    
    # Apply filters
    if period_start:
        query = query.filter(Transaction.date >= period_start)
    if period_end:
        query = query.filter(Transaction.date <= period_end)
    if vat_treatment:
        query = query.filter(Transaction.vat_treatment == vat_treatment)
    if flag_for_review is not None:
        # Note: flag_for_review is derived from confidence_score < 70 or other logic
        # For now, we'll use confidence_score < 70 as proxy
        if flag_for_review:
            query = query.filter(Transaction.confidence_score < 70)
        else:
            query = query.filter(Transaction.confidence_score >= 70)
    
    transactions = query.order_by(Transaction.date.desc()).all()
    
    return transactions


@router.get("/transactions/enriched")
async def get_transactions_enriched(
    limit: int = Query(200, ge=1, le=1000),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Transactions with entertainment, reverse charge, and review tier flags."""
    rows = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id)
        .order_by(Transaction.date.desc())
        .limit(limit)
        .all()
    )
    enriched = []
    for t in rows:
        e = enrich_transaction_row(t)
        detail = _parse_ai_reasoning(t.ai_reasoning)
        if not detail:
            detail = build_structured_reasoning(
                description=t.description or "",
                vendor_or_customer=t.vendor_or_customer,
                vendor_trn=t.vendor_trn,
                transaction_type=t.transaction_type or "purchase",
                classification={
                    "vat_treatment": t.vat_treatment,
                    "box_number": t.box_number,
                    "confidence_score_0_100": t.confidence_score,
                    "flag_for_review": not t.is_verified,
                    "flag_reason": e.get("flag_reason"),
                    "flags": e.get("flags") or [],
                    "explanation": e.get("explanation"),
                    "blocked_input_vat": e.get("blocked_input_vat"),
                    "entertainment_flag": e.get("entertainment_flag"),
                },
            )
        e["reasoning_detail"] = detail
        e["explanation"] = detail.get("primary_reason") or e.get("explanation")
        enriched.append(e)
    tiers = {"auto_approve": 0, "review_required": 0, "blocked": 0}
    for e in enriched:
        tiers[e["review_tier"]] = tiers.get(e["review_tier"], 0) + 1
    return {"transactions": enriched, "tier_counts": tiers}


def _transaction_flagged(t: Transaction) -> bool:
    """True when transaction needs review or is blocked."""
    if not t.is_verified:
        return True
    treatment = (t.vat_treatment or "").lower()
    if treatment in ("entertainment_restricted",):
        return True
    flags = t.classification_flags or []
    return any((f.get("code") or "") not in ("clear", "") for f in flags)


@router.get("/vendors")
async def list_vendors_from_classifier(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Supplier ledger — vendors aggregated from VAT Classifier transactions."""
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.transaction_type == "purchase",
        )
        .all()
    )

    vendor_map: Dict[str, Dict[str, Any]] = {}
    for t in txns:
        name = (t.vendor_or_customer or "").strip() or "(unknown)"
        if name not in vendor_map:
            vendor_map[name] = {
                "vendor_name": name,
                "transaction_count": 0,
                "total_spend_aed": 0.0,
                "total_vat_aed": 0.0,
                "vat_treatments": [],
                "flagged_count": 0,
                "blocked_count": 0,
            }
        v = vendor_map[name]
        v["transaction_count"] += 1
        v["total_spend_aed"] += float(t.amount_aed or 0)
        v["total_vat_aed"] += float(t.vat_amount_aed or 0)
        if t.vat_treatment:
            v["vat_treatments"].append(t.vat_treatment)
        if _transaction_flagged(t):
            v["flagged_count"] += 1
        if (t.vat_treatment or "") == "entertainment_restricted":
            v["blocked_count"] += 1

    result = []
    for v in vendor_map.values():
        treatments = v["vat_treatments"]
        typical = max(set(treatments), key=treatments.count) if treatments else None
        flagged = v["flagged_count"]
        risk = "high" if flagged > 0 else "low"

        result.append({
            "vendor_name": v["vendor_name"],
            "transaction_count": v["transaction_count"],
            "total_spend_aed": round(v["total_spend_aed"], 2),
            "total_vat_aed": round(v["total_vat_aed"], 2),
            "vat_treatment": typical,
            "flagged_count": flagged,
            "risk_level": risk,
        })

    result.sort(key=lambda x: (-x["flagged_count"], -x["total_spend_aed"]))
    return result


@router.post("/transactions/bulk-approve-high-confidence")
async def bulk_approve_high_confidence(
    body: BulkApproveHighConfidenceRequest,
    auth: dict = require_role("analyst"),
    db: Session = Depends(get_db),
):
    """Approve all unverified transactions with confidence >= threshold (default 0.85)."""
    company_id = auth["company_id"]
    actor = auth["user"].get("email") or body.verified_by or "user"
    threshold_pct = body.min_confidence * 100
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.is_verified == False,  # noqa: E712
            Transaction.confidence_score >= threshold_pct,
        )
        .all()
    )
    approved = 0
    skipped_blocked = 0
    for t in rows:
        enriched = enrich_transaction_row(t, threshold_0_100=threshold_pct)
        if enriched["review_tier"] == "blocked":
            skipped_blocked += 1
            continue
        t.is_verified = True
        _append_verification_history(
            t,
            {"type": "bulk_approve_high_confidence", "min_confidence": body.min_confidence, "verified_by": body.verified_by},
        )
        approved += 1

    if approved:
        db.add(
            AuditLog(
                company_id=company_id,
                actor=actor,
                action="approval",
                entity=f"{approved} transactions bulk-approved",
            )
        )
    db.commit()
    return {
        "approved_count": approved,
        "skipped_blocked": skipped_blocked,
        "min_confidence": body.min_confidence,
    }


@router.delete("/transactions/all")
async def delete_all_transactions(
    auth: dict = require_role("admin"),
    db: Session = Depends(get_db),
):
    """
    Delete ALL classified transactions for this company.
    Useful for clearing duplicate data from repeated test uploads.
    """
    company_id = auth["company_id"]
    actor = auth["user"].get("email") or "user"
    deleted = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id)
        .delete(synchronize_session=False)
    )
    db.add(
        AuditLog(
            company_id=company_id,
            actor=actor,
            action="delete",
            entity=f"{deleted} transactions deleted",
        )
    )
    db.commit()
    return {"deleted_count": deleted, "message": f"Deleted {deleted} transactions. You can now re-upload your file."}


@router.patch("/transactions/{transaction_id}/verify")
async def verify_transaction(
    transaction_id: int,
    request: PatchVerifyTransactionRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Verify or unverify a transaction; optionally override VAT treatment with audit trail.
    """
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.company_id == company_id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if request.override_treatment:
        prev = transaction.vat_treatment
        transaction.vat_treatment = request.override_treatment
        transaction.vat_amount_aed = _vat_amount_for_treatment(
            transaction.amount_aed, request.override_treatment
        )
        _append_verification_history(
            transaction,
            {
                "type": "treatment_override",
                "previous_vat_treatment": prev,
                "new_vat_treatment": request.override_treatment,
                "note": request.note,
            },
        )

    transaction.is_verified = request.is_verified
    if request.note and not request.override_treatment:
        _append_verification_history(
            transaction,
            {"type": "note", "note": request.note},
        )

    db.add(
        AuditLog(
            company_id=transaction.company_id,
            actor="user",
            action="transaction_verify_patch",
            entity=f"transaction:{transaction.id}",
        )
    )
    db.commit()
    db.refresh(transaction)

    return {
        "status": "success",
        "message": "Transaction updated",
        "transaction": TransactionResponse.model_validate(transaction),
    }


@router.post("/transactions/bulk-verify")
async def bulk_verify_transactions(
    body: BulkVerifyRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Mark many transactions as verified."""
    unique_ids = list(dict.fromkeys(body.transaction_ids))
    # Filter by both IDs and company_id — prevents cross-tenant access
    rows = (
        db.query(Transaction)
        .filter(Transaction.id.in_(unique_ids), Transaction.company_id == company_id)
        .all()
    )
    if len(rows) != len(unique_ids):
        raise HTTPException(status_code=404, detail="One or more transaction IDs not found")
    for t in rows:
        t.is_verified = True
        _append_verification_history(
            t,
            {"type": "bulk_verify", "verified_by": body.verified_by},
        )

    db.add(
        AuditLog(
            company_id=company_id,
            actor=body.verified_by,
            action="bulk_transaction_verify",
            entity=f"{len(rows)} transactions",
        )
    )
    db.commit()

    return {"verified_count": len(rows)}


@router.post("/reclassify-exempt")
async def reclassify_exempt_purchases(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Re-run AI classification on all purchase transactions currently marked
    as 'exempt'. Used to correct transactions where professional services
    (KPMG, law firms, consultants) were wrongly classified as exempt.

    With the updated system prompt, they will now return standard_rated.
    """
    exempt_purchases = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.transaction_type == "purchase",
            Transaction.vat_treatment == "exempt",
        )
        .all()
    )

    if not exempt_purchases:
        return {"reclassified": 0, "message": "No exempt purchase transactions found."}

    company = db.query(Company).filter(Company.id == company_id).first()
    entity_type = (company.entity_type if company else None) or "mainland"

    reclassified = 0
    results = []

    for txn in exempt_purchases:
        try:
            classification = classify_with_claude_and_rag(
                description=txn.description or "",
                amount_aed=float(txn.amount_aed or 0),
                vendor_or_customer=txn.vendor_or_customer,
                transaction_type="purchase",
                entity_type=entity_type,
                audit_db=db,
                audit_company_id=company_id,
                audit_actor="user",
            )
            new_treatment = classification["vat_treatment"]
            if new_treatment != "exempt":
                old_treatment = txn.vat_treatment
                txn.vat_treatment = new_treatment
                txn.vat_amount_aed = classification["vat_amount_aed"]
                txn.confidence_score = round(classification["confidence_score"] * 100, 1)
                txn.ai_reasoning = classification["reasoning"]
                txn.is_verified = False  # needs re-verification after reclassify
                _append_verification_history(
                    txn,
                    {
                        "type": "reclassify",
                        "previous_vat_treatment": old_treatment,
                        "new_vat_treatment": new_treatment,
                        "note": "Auto-reclassified via /reclassify-exempt endpoint",
                    },
                )
                reclassified += 1
                results.append({
                    "id": txn.id,
                    "description": txn.description,
                    "old_treatment": old_treatment,
                    "new_treatment": new_treatment,
                    "new_vat_amount_aed": txn.vat_amount_aed,
                })
        except Exception as exc:
            print(f"[reclassify-exempt] error on txn {txn.id}: {exc}", flush=True)

    db.commit()
    return {
        "reclassified": reclassified,
        "total_checked": len(exempt_purchases),
        "message": f"{reclassified} of {len(exempt_purchases)} exempt purchases reclassified to standard-rated.",
        "details": results,
    }
