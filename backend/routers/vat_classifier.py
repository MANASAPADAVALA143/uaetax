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


def _vat_amount_for_treatment(amount_aed: float, treatment: Optional[str]) -> float:
    if treatment in ("standard_rated", "reverse_charge"):
        return round(float(amount_aed) * 0.05, 2)
    return 0.0


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

You must return ONLY valid JSON with no additional text, markdown, or code blocks."""

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
  "flag_reason": "reason if flagged, null otherwise"
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
        
        return {
            "vat_treatment": vat_treatment,
            "vat_rate": vat_rate,
            "vat_amount_aed": vat_amount_aed,
            "confidence_score": confidence_score,
            "reasoning": reasoning,
            "flag_for_review": flag_for_review,
            "flag_reason": flag_reason,
            "rag_citations": rag_citations,
            "uae_law_sources": rag_sources,
        }

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
    
    # Save to database — always use the verified company_id from auth
    transaction = Transaction(
        company_id=company_id,
        date=request.transaction_date or date.today(),
        description=request.description,
        amount_aed=request.amount_aed,
        vendor_or_customer=request.vendor_or_customer,
        invoice_number=request.invoice_number,
        vat_treatment=classification["vat_treatment"],
        transaction_type=request.transaction_type,
        vat_amount_aed=classification["vat_amount_aed"],
        confidence_score=classification["confidence_score"] * 100,  # Convert to 0-100 scale
        ai_reasoning=classification["reasoning"],
        is_verified=False,
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    return ClassificationResult(
        vat_treatment=classification["vat_treatment"],
        vat_rate=classification["vat_rate"],
        vat_amount_aed=classification["vat_amount_aed"],
        confidence_score=classification["confidence_score"],
        reasoning=classification["reasoning"],
        flag_for_review=classification["flag_for_review"],
        flag_reason=classification["flag_reason"]
    )


@router.post("/classify-bulk")
async def classify_bulk(
    file: UploadFile = File(...),
    entity_type: str = Query("mainland", pattern="^(mainland|free_zone|designated_zone)$"),
    transaction_type: str = Query("sale", pattern="^(sale|purchase)$"),
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
            df = pd.read_excel(file.file)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Please upload CSV or Excel file.",
            )

        df.columns = df.columns.str.strip().str.lower()

        description_col = amount_col = vendor_col = date_col = invoice_col = None
        for col in df.columns:
            col_lower = col.lower()
            if "desc" in col_lower or "transaction" in col_lower or "item" in col_lower:
                description_col = col
            elif "amount" in col_lower or "value" in col_lower or "total" in col_lower:
                amount_col = col
            elif "vendor" in col_lower or "customer" in col_lower or "supplier" in col_lower or "party" in col_lower:
                vendor_col = col
            elif "date" in col_lower:
                date_col = col
            elif "invoice" in col_lower:
                invoice_col = col

        if not description_col:
            raise HTTPException(status_code=400, detail="Could not find description column in file.")
        if not amount_col:
            raise HTTPException(status_code=400, detail="Could not find amount column in file.")

        has_tx_type_col = "transaction_type" in df.columns

        # ── Build row specs (parse before parallelising) ──────────────────────
        row_specs: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            description = str(row[description_col]) if pd.notna(row[description_col]) else ""
            if not description.strip():
                continue

            row_tx_type = transaction_type
            if has_tx_type_col and pd.notna(row.get("transaction_type", None)):
                v = str(row["transaction_type"]).lower().strip()
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
            row_specs.append({
                "description": description,
                "amount": amount,
                "vendor": vendor,
                "trans_date": trans_date,
                "invoice_num": invoice_num,
                "row_tx_type": row_tx_type,
                "raw_row": {str(c): row.get(c) for c in df.columns},
            })

        if not row_specs:
            raise HTTPException(status_code=400, detail="No classifiable rows found in file.")

        # ── Classify ALL rows in ONE Claude API call (batch) ─────────────────
        if claude_client is None:
            raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured.")

        batch_items = "\n".join(
            f'{i+1}. description="{s["description"]}" | amount={s["amount"]} AED'
            f' | party="{s["vendor"] or "N/A"}" | type={s["row_tx_type"]}'
            for i, s in enumerate(row_specs)
        )

        batch_prompt = f"""You are a UAE VAT expert. Classify each transaction under Federal Decree-Law No.8 of 2017.

Entity type: {entity_type}

Transactions:
{batch_items}

Return a JSON array (one object per transaction, in the same order). Each object:
{{
  "index": <1-based int>,
  "vat_treatment": "standard_rated|zero_rated|exempt|out_of_scope|reverse_charge",
  "vat_rate": 5 or 0,
  "vat_amount_aed": <net_amount * rate/100>,
  "confidence_score": <0.0-1.0>,
  "reasoning": "<one sentence citing UAE VAT law>",
  "flag_for_review": true or false,
  "flag_reason": "<string or null>"
}}

Return ONLY the JSON array. No markdown, no preamble."""

        try:
            msg = claude_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                temperature=0.1,
                messages=[{"role": "user", "content": batch_prompt}],
            )
            raw_text = msg.content[0].text.strip()
            if "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:].strip()
            batch_results: List[Dict[str, Any]] = json.loads(raw_text)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Batch classification failed: {exc}")

        # Map results back by index (Claude returns in order but be safe)
        result_map = {r["index"]: r for r in batch_results}
        classifications: List[Dict[str, Any]] = []
        for i, spec in enumerate(row_specs):
            r = result_map.get(i + 1, {})
            classifications.append({
                "vat_treatment": r.get("vat_treatment", "standard_rated"),
                "vat_rate": r.get("vat_rate", 5),
                "vat_amount_aed": r.get("vat_amount_aed", spec["amount"] * 0.05),
                "confidence_score": r.get("confidence_score", 0.8),
                "reasoning": r.get("reasoning", "Classified under UAE VAT Law"),
                "flag_for_review": r.get("flag_for_review", False),
                "flag_reason": r.get("flag_reason"),
                "rag_citations": [],
            })

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
                transaction_type=spec["row_tx_type"],
                vat_amount_aed=classification["vat_amount_aed"],
                confidence_score=classification["confidence_score"] * 100,
                ai_reasoning=classification["reasoning"],
                is_verified=False,
            )
            db_transactions.append(db_transaction)

            excel_row = spec["raw_row"].copy()
            excel_row.update(
                {
                    "gulftax_transaction_id": None,
                    "vat_treatment": classification["vat_treatment"],
                    "vat_rate": classification["vat_rate"],
                    "vat_amount_aed": classification["vat_amount_aed"],
                    "confidence_0_1": classification["confidence_score"],
                    "reasoning": classification["reasoning"],
                    "needs_review": classification["flag_for_review"],
                    "flag_reason": classification.get("flag_reason"),
                    "transaction_type": spec["row_tx_type"],
                }
            )
            excel_rows.append(excel_row)
            per_row_meta.append(
                {
                    "flag_for_review": classification["flag_for_review"],
                    "rag_citations": classification.get("rag_citations") or [],
                    "vat_rate": float(classification["vat_rate"]),
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
        for t, meta in zip(db_transactions, per_row_meta):
            conf01 = (t.confidence_score or 0.0) / 100.0
            classifications_out.append(
                {
                    "id": t.id,
                    "description": t.description,
                    "vendor_or_customer": t.vendor_or_customer or "",
                    "amount_aed": float(t.amount_aed),
                    "vat_treatment": t.vat_treatment or "standard_rated",
                    "vat_rate": float(meta["vat_rate"]),
                    "vat_amount_aed": float(t.vat_amount_aed or 0.0),
                    "confidence": conf01,
                    "needs_review": bool(meta["flag_for_review"]),
                    "reasoning": t.ai_reasoning or "",
                    "rag_citations": meta.get("rag_citations") or [],
                }
            )

        needs_review_count = sum(1 for c in classifications_out if c["needs_review"])

        return {
            "job_id": job_id,
            "summary": {
                "total_rows": len(df),
                "classified_rows": len(classifications_out),
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
