"""VAT Classification API Router"""
import os
import uuid
import tempfile
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
from middleware.auth import get_current_company_id

# pgvector-backed RAG service — import never fails; returns [] on any error
from services.uae_tax_rag_pg import uae_tax_rag  # type: ignore
from services.vat_decision_tree import classify_with_decision_tree
from services.vat_enrichment import apply_post_classification_rules, enrich_transaction_row

from database import get_db
from models import Transaction, Company, AuditLog

load_dotenv()

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


def _vat_amount_for_treatment(amount_aed: float, treatment: Optional[str]) -> float:
    if treatment in ("standard_rated", "reverse_charge", "import_vat", "entertainment_restricted"):
        return round(float(amount_aed) * 0.05, 2)
    return 0.0


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
        "reasoning": classification.get("explanation") or classification.get("reasoning", ""),
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


def classify_with_claude_and_rag(
    description: str,
    amount_aed: float,
    vendor_or_customer: Optional[str],
    transaction_type: str,
    entity_type: str
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

    # Retrieve UAE law context from pgvector (never raises)
    rag_context, rag_sources = uae_tax_rag.retrieve_and_format(
        query=f"{description} {transaction_type} {entity_type}",
        law_type="VAT",
    )
    rag_citations: List[str] = rag_sources  # doc names used

    # Step 2: Build Claude prompt with RAG context
    system_prompt = """You are a UAE VAT specialist with deep knowledge of Federal Decree-Law No. 8 of 2017 and FTA clarifications. You classify transactions for UAE VAT returns with precision.

You must return ONLY valid JSON with no additional text, markdown, or code blocks.

CRITICAL UAE VAT RULES — READ FIRST:

PROFESSIONAL SERVICES ARE ALWAYS STANDARD RATED (5% VAT, Art.25):
- Audit and assurance fees (KPMG, PwC, Deloitte, EY, BDO, Grant Thornton)
- Tax advisory, CT advisory, corporate tax consulting fees
- Legal advisory fees (law firms, advocates, LLPs, Hadef & Partners, Clifford Chance, Baker McKenzie)
- Management consulting and strategy consulting (McKinsey, BCG, Bain, Pinnacle)
- Financial advisory, M&A advisory, financial modelling
- Compliance training and certification (Thomson Reuters, etc.)
- Company secretarial and registered agent services
- HR and payroll processing services
- IT consulting, IT security, penetration testing, cybersecurity
- Any service described as "advisory", "consulting", "assurance", "training", "secretarial"
DO NOT classify these as exempt — they are NEVER exempt under UAE VAT.

EXEMPT (Art.42) covers ONLY these financial services:
- Bank interest, loan charges, credit facility fees
- Currency exchange and foreign exchange transactions
- Life insurance policies (not general/commercial insurance)
- Investment fund management fees
- Deposit and savings account services
DO NOT apply exempt to professional fee services.

INSURANCE (Art.25 STANDARD RATED — 5% VAT):
- General/commercial insurance (AXA, Chubb, RSA, QBE, property, liability, cyber, indemnity)
- Professional indemnity insurance = STANDARD RATED
- Only pure life insurance policies = exempt

COMMERCIAL PROPERTY (Art.25 STANDARD RATED):
- Commercial office rent, warehouse rent, retail space = STANDARD RATED
- DIFC, Business Bay, JLT, SZR, Burj Daman, DWTC office rent = ALWAYS standard rated
- Free zone office rent = STANDARD RATED
- Only residential villa/apartment rent for private use = EXEMPT (Art.28)

SPECIFIC VENDOR RULES (ALWAYS STANDARD RATED):
- KPMG, PwC, Deloitte, EY, McKinsey, BCG, Bain, Hadef, Thomson Reuters
- Any "& Partners", "& Co", "LLP", "Advocates", "Consulting", "Advisory" in name
- DIFC Investments, Emaar Facilities, any facilities management company

ENTERTAINMENT / CATERING (Art.53 — Input VAT BLOCKED):
- When description contains: catering, dinner, entertainment, hospitality, gala, buffet, restaurant
- AND transaction_type = purchase:
  - vat_treatment = standard_rated (the supply is taxable)
  - Set blocked_input_vat = true
  - Set blocked_reason = "Art.53(1)(b) — input VAT on entertainment/meals not recoverable"
  - blocked_vat_amount = amount * 0.05"""

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
Entity type: {entity_type}

{context_section}

Return JSON only:
{{
  "vat_treatment": "standard_rated|zero_rated|exempt|out_of_scope|reverse_charge",
  "vat_rate": 5 or 0,
  "vat_amount_aed": <calculated float>,
  "confidence_score": <0.0-1.0>,
  "reasoning": "one sentence explanation citing UAE VAT law",
  "flag_for_review": true or false,
  "flag_reason": "reason if flagged, null otherwise",
  "blocked_input_vat": false,
  "blocked_reason": null,
  "blocked_vat_amount": 0.0
}}"""

    try:
        # Call Claude API
        message = claude_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
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
        reasoning = result.get("reasoning", "Classification based on UAE VAT rules")
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
            "reasoning": reasoning,
            "flag_for_review": flag_for_review,
            "flag_reason": flag_reason,
            "blocked_input_vat": blocked_input_vat,
            "blocked_reason": blocked_reason,
            "blocked_vat_amount": blocked_vat_amount,
            "rag_citations": rag_citations,
            "uae_law_sources": rag_sources,
            "_amount_aed": amount_aed,
        }
        return apply_post_classification_rules(
            normalized,
            description=description,
            vendor_or_customer=vendor_or_customer,
            transaction_type=transaction_type,
        )

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
        entity_type=entity_type
    )
    saved = _save_classification_fields(classification, request.amount_aed)
    
    # Save to database — always use the verified company_id from auth
    transaction = Transaction(
        company_id=company_id,
        date=request.transaction_date or date.today(),
        description=request.description,
        amount_aed=request.amount_aed,
        vendor_or_customer=request.vendor_or_customer,
        invoice_number=request.invoice_number,
        vat_treatment=saved["vat_treatment"],
        transaction_type=saved.get("transaction_side", request.transaction_type),
        vat_amount_aed=saved["vat_amount_aed"],
        confidence_score=saved["confidence_score_0_100"],
        ai_reasoning=saved["reasoning"],
        box_number=saved["box_number"],
        classification_flags=saved["flags"],
        is_verified=saved["review_tier"] == "auto_approve",
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    return ClassificationResult(
        vat_treatment=saved["vat_treatment"],
        vat_rate=saved["vat_rate"],
        vat_amount_aed=saved["vat_amount_aed"],
        confidence_score=saved["confidence_score_0_1"],
        reasoning=saved["reasoning"],
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

        # Detect transaction_type column — handles both "transaction_type" (CSV)
        # and "Transaction Type" → "transaction type" (Excel) after lowercasing
        tx_type_col = next(
            (col for col in df.columns if "transaction" in col and "type" in col),
            None,
        )
        has_tx_type_col = tx_type_col is not None

        # ── Build row specs (parse before parallelising) ──────────────────────
        row_specs: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            description = str(row[description_col]) if pd.notna(row[description_col]) else ""
            if not description.strip():
                continue

            row_tx_type = transaction_type
            if has_tx_type_col and tx_type_col and pd.notna(row.get(tx_type_col, None)):
                v = str(row[tx_type_col]).lower().strip()
                if v in ("sale", "purchase"):
                    row_tx_type = v

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
            classifications.append(_save_classification_fields(raw, spec["amount"]))

        # ── Build DB objects and response rows ────────────────────────────────
        db_transactions: List[Transaction] = []
        excel_rows: List[Dict[str, Any]] = []
        per_row_meta: List[Dict[str, Any]] = []

        for spec, classification in zip(row_specs, classifications):
            db_transaction = Transaction(
                company_id=company_id,
                date=spec["trans_date"],
                description=spec["description"],
                amount_aed=spec["amount"],
                vendor_or_customer=spec["vendor"],
                invoice_number=spec["invoice_num"],
                vat_treatment=classification["vat_treatment"],
                transaction_type=classification.get("transaction_side", spec["row_tx_type"]),
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
                    "transaction_type": classification.get("transaction_side", spec["row_tx_type"]),
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
    enriched = [enrich_transaction_row(t) for t in rows]
    tiers = {"auto_approve": 0, "review_required": 0, "blocked": 0}
    for e in enriched:
        tiers[e["review_tier"]] = tiers.get(e["review_tier"], 0) + 1
    return {"transactions": enriched, "tier_counts": tiers}


@router.post("/transactions/bulk-approve-high-confidence")
async def bulk_approve_high_confidence(
    body: BulkApproveHighConfidenceRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Approve all unverified transactions with confidence >= threshold (default 0.85)."""
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
                actor=body.verified_by,
                action="bulk_approve_high_confidence",
                entity=f"{approved} transactions",
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
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """
    Delete ALL classified transactions for this company.
    Useful for clearing duplicate data from repeated test uploads.
    """
    deleted = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id)
        .delete(synchronize_session=False)
    )
    db.add(
        AuditLog(
            company_id=company_id,
            actor="user",
            action="delete_all_transactions",
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
