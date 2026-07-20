"""Smart Excel Upload — one master file routes data to all GulfTax modules."""
from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import AdvancePayment, Company, Transaction
from routers.advance_payment import AdvancePaymentCalcIn, AdvancePaymentSaveIn, _calculate, _normalize_vat_rate
from routers.vat_classifier import (
    _enforce_transaction_direction,
    _find_tx_type_column,
    _parse_tx_type_value,
    _resolve_saved_transaction_type,
    _save_classification_fields,
    _sync_vat_classifications_to_supabase,
)
from routers.vat_compliance_review import (
    MAX_FILE_BYTES,
    _detect_columns,
    _is_valid_excel_header,
    _looks_like_title_row,
    _normalize_transactions,
    _run_compliance_analysis,
    _save_review_supabase,
    _to_float,
    transactions_for_compliance_from_db,
)
from services.vat_decision_tree import classify_with_decision_tree
from services.vat_enrichment import apply_post_classification_rules
from utils.audit import log_ai_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/smart-upload", tags=["Smart Upload"])

TRANSACTION_KEYWORDS = (
    "date", "invoice", "description", "amount", "vat", "treatment",
    "vendor", "customer", "type", "trn",
)
ADVANCE_KEYWORDS = ("advance", "contract", "delivery", "deposit")
CT_KEYWORDS = ("profit", "taxable", "corporate tax", "esr", "substance")

ENTITY_TYPE_LABELS = {
    "mainland": "Mainland UAE",
    "free_zone": "Free Zone",
    "designated_zone": "Designated Zone",
}


def _prepare_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    if raw_df.empty:
        return raw_df
    header_row: Optional[int] = None
    for i in range(min(8, len(raw_df))):
        row_vals = raw_df.iloc[i].values
        if _looks_like_title_row(row_vals):
            continue
        candidate_cols = [str(v).strip() for v in row_vals]
        if _is_valid_excel_header(candidate_cols):
            header_row = i
            break
    if header_row is None:
        for i in range(min(3, len(raw_df))):
            candidate_cols = [str(v).strip() for v in raw_df.iloc[i].values]
            if _is_valid_excel_header(candidate_cols):
                header_row = i
                break
    if header_row is None:
        return pd.DataFrame()
    df = raw_df.iloc[header_row + 1 :].copy()
    df.columns = [str(v).strip().lower() for v in raw_df.iloc[header_row].values]
    return df.dropna(how="all").reset_index(drop=True)


def _load_workbook_sheets(raw: bytes) -> Dict[str, pd.DataFrame]:
    xls = pd.ExcelFile(BytesIO(raw), engine="openpyxl")
    sheets: Dict[str, pd.DataFrame] = {}
    for name in xls.sheet_names:
        raw_df = pd.read_excel(xls, sheet_name=name, header=None)
        prepared = _prepare_dataframe(raw_df)
        if not prepared.empty:
            sheets[name] = prepared
    return sheets


def _column_blob(df: pd.DataFrame) -> str:
    return " ".join(str(c).lower().strip() for c in df.columns)


def _detect_sheet_type(df: pd.DataFrame, sheet_name: str = "") -> Optional[str]:
    cols = _column_blob(df)
    name = sheet_name.lower()
    advance_hits = sum(1 for k in ADVANCE_KEYWORDS if k in cols)
    tx_hits = sum(1 for k in TRANSACTION_KEYWORDS if k in cols)
    ct_hits = sum(1 for k in CT_KEYWORDS if k in cols)

    if "advance" in name or "deposit" in name:
        return "advance_payments"
    if "advance" in cols and any(k in cols for k in ("contract", "delivery", "deposit", "order")):
        return "advance_payments"
    if tx_hits >= 2 and "description" in cols:
        return "transactions"
    if tx_hits >= 3:
        return "transactions"
    if advance_hits >= 2:
        return "advance_payments"
    if ct_hits >= 1:
        return "ct_esr"
    return None


def _infer_period(sheet_names: List[str], filename: str) -> str:
    text = f"{filename} {' '.join(sheet_names)}".lower()
    match = re.search(r"q([1-4])\s*[\-–]?\s*(\d{4})", text)
    if match:
        return f"Q{match.group(1)} {match.group(2)}"
    year = re.search(r"(20\d{2})", text)
    q = ((date.today().month - 1) // 3) + 1
    if year:
        return f"Q{q} {year.group(1)}"
    return f"Q{q} {date.today().year}"


def _parse_date(val: Any) -> Optional[date]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return pd.to_datetime(val).date()
    except Exception:
        return None


def _sheet_has_advance_columns(df: pd.DataFrame) -> bool:
    cols = _column_blob(df)
    hits = sum(1 for k in ADVANCE_KEYWORDS if k in cols)
    return hits >= 2 or ("advance" in cols and "contract" in cols)


def _parse_transaction_specs(
    df: pd.DataFrame,
    default_tx_type: str = "purchase",
) -> List[Dict[str, Any]]:
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
        if "country" in col_lower:
            country_col = col

    if not description_col or not amount_col:
        return []

    tx_type_col = _find_tx_type_column(df)
    specs: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        description = str(row[description_col]).strip() if pd.notna(row[description_col]) else ""
        if not description:
            continue
        row_tx_type = default_tx_type
        if tx_type_col is not None:
            parsed = _parse_tx_type_value(row.get(tx_type_col))
            if parsed:
                row_tx_type = parsed
        amount = _to_float(row[amount_col])
        if amount <= 0:
            continue
        trans_date = _parse_date(row.get(date_col)) if date_col else date.today()
        specs.append(
            {
                "description": description,
                "amount": amount,
                "vendor": str(row[vendor_col]).strip() if vendor_col and pd.notna(row.get(vendor_col, "")) else None,
                "vendor_trn": str(row[trn_col]).strip() if trn_col and pd.notna(row.get(trn_col, "")) else None,
                "vendor_country": str(row[country_col]).strip() if country_col and pd.notna(row.get(country_col, "")) else None,
                "trans_date": trans_date or date.today(),
                "invoice_num": str(row[invoice_col]).strip() if invoice_col and pd.notna(row.get(invoice_col, "")) else None,
                "row_tx_type": row_tx_type,
            }
        )
    return specs


def _detect_advance_columns(df: pd.DataFrame) -> Dict[str, Optional[str]]:
    mapping: Dict[str, Optional[str]] = {
        "order_value": None,
        "advance_amount": None,
        "advance_date": None,
        "delivery_date": None,
        "description": None,
        "customer": None,
        "invoice": None,
        "trn": None,
        "vat_rate": None,
    }
    for col in df.columns:
        cl = str(col).lower()
        if mapping["order_value"] is None and any(k in cl for k in (
            "contract value", "contract_value", "order value", "order_value",
            "contract amount", "total contract", "project value",
        )):
            mapping["order_value"] = col
        if mapping["order_value"] is None and cl in ("contract value aed", "order value aed", "contract aed"):
            mapping["order_value"] = col
        if mapping["advance_amount"] is None and any(k in cl for k in ("advance amount", "advance paid", "deposit")):
            mapping["advance_amount"] = col
        if mapping["advance_amount"] is None and "advance" in cl and "date" not in cl and "vat" not in cl:
            mapping["advance_amount"] = col
        if mapping["advance_date"] is None and ("advance date" in cl or cl == "advance_date" or (cl == "date" and "delivery" not in cl)):
            mapping["advance_date"] = col
        if mapping["delivery_date"] is None and any(k in cl for k in ("delivery date", "delivery_date", "delivery", "completion")):
            mapping["delivery_date"] = col
        if mapping["description"] is None and any(k in cl for k in ("description", "notes", "project")):
            mapping["description"] = col
        if mapping["customer"] is None and any(k in cl for k in ("customer", "client")):
            mapping["customer"] = col
        if mapping["invoice"] is None and "invoice" in cl:
            mapping["invoice"] = col
        if mapping["trn"] is None and "trn" in cl:
            mapping["trn"] = col
        if mapping["vat_rate"] is None and "vat rate" in cl:
            mapping["vat_rate"] = col
    return mapping


def _parse_advance_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    cols = _detect_advance_columns(df)
    if not cols.get("order_value") or not cols.get("advance_amount"):
        return []
    rows: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        order_value = _to_float(row.get(cols["order_value"]))
        advance_amount = _to_float(row.get(cols["advance_amount"]))
        if order_value <= 0 or advance_amount < 0:
            continue
        adv_date = _parse_date(row.get(cols["advance_date"])) if cols.get("advance_date") else None
        del_date = _parse_date(row.get(cols["delivery_date"])) if cols.get("delivery_date") else None
        if not adv_date:
            adv_date = date.today()
        if not del_date:
            del_date = adv_date + timedelta(days=90)
        if del_date < adv_date:
            del_date = adv_date + timedelta(days=30)
        desc_parts = []
        if cols.get("description") and pd.notna(row.get(cols["description"])):
            desc_parts.append(str(row.get(cols["description"])).strip())
        if cols.get("customer") and pd.notna(row.get(cols["customer"])):
            desc_parts.append(str(row.get(cols["customer"])).strip())
        if cols.get("invoice") and pd.notna(row.get(cols["invoice"])):
            desc_parts.append(str(row.get(cols["invoice"])).strip())
        vat_rate = _to_float(row.get(cols["vat_rate"])) if cols.get("vat_rate") else 5.0
        if vat_rate <= 0:
            vat_rate = 5.0
        rows.append(
            {
                "order_value": order_value,
                "advance_amount": advance_amount,
                "advance_date": adv_date,
                "delivery_date": del_date,
                "description": " — ".join(desc_parts) if desc_parts else None,
                "vat_rate": vat_rate,
            }
        )
    return rows


def _extract_ct_summary(df: pd.DataFrame) -> Dict[str, Any]:
    summary: Dict[str, Any] = {}
    label_map = {
        "accounting_profit": ("accounting profit", "net profit", "profit before tax", "pbt"),
        "taxable_income": ("taxable income", "taxable profit", "adjusted profit"),
        "tax_payable": ("tax payable", "corporate tax", "ct liability"),
        "esr_substance": ("esr", "substance", "economic substance"),
    }
    for _, row in df.iterrows():
        values = [row.get(c) for c in df.columns]
        for i, val in enumerate(values):
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            text = str(val).lower().strip()
            for key, keywords in label_map.items():
                if key in summary:
                    continue
                if any(kw in text for kw in keywords):
                    for j in range(i + 1, len(values)):
                        num = _to_float(values[j])
                        if num != 0:
                            summary[key] = num
                            break
                    if key not in summary and i + 1 < len(df.columns):
                        num = _to_float(row.iloc[i + 1] if i + 1 < len(row) else None)
                        if num != 0:
                            summary[key] = num
    for col in df.columns:
        cl = str(col).lower()
        for key, keywords in label_map.items():
            if key in summary:
                continue
            if any(kw in cl for kw in keywords):
                nums = [_to_float(v) for v in df[col] if _to_float(v) != 0]
                if nums:
                    summary[key] = nums[0]
    return summary


def _process_transactions(
    df: pd.DataFrame,
    company_id: int,
    entity_type: str,
    db: Session,
    filename: str,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    specs = _parse_transaction_specs(df)
    if not specs:
        return {"count": 0, "classified": 0, "auto_approved": 0, "review_required": 0, "blocked": 0}, []

    existing_nums: set = set()
    candidate_nums = {s["invoice_num"] for s in specs if s["invoice_num"]}
    if candidate_nums:
        existing_rows = (
            db.query(Transaction.invoice_number)
            .filter(Transaction.company_id == company_id, Transaction.invoice_number.in_(candidate_nums))
            .all()
        )
        existing_nums = {r.invoice_number for r in existing_rows}

    specs = [s for s in specs if not s["invoice_num"] or s["invoice_num"] not in existing_nums]
    if not specs:
        return {
            "count": 0,
            "classified": 0,
            "auto_approved": 0,
            "review_required": 0,
            "blocked": 0,
            "skipped_duplicates": len(candidate_nums),
        }, []

    db_transactions: List[Transaction] = []
    normalized_for_compliance: List[Dict[str, Any]] = []
    auto_approved = review_required = blocked = 0

    for spec in specs:
        raw = classify_with_decision_tree(
            description=spec["description"],
            amount_aed=spec["amount"],
            vendor_or_customer=spec["vendor"],
            transaction_type=spec["row_tx_type"],
            vendor_trn=spec.get("vendor_trn"),
            vendor_country=spec.get("vendor_country"),
        )
        merged = apply_post_classification_rules(
            raw,
            description=spec["description"],
            vendor_or_customer=spec["vendor"],
            transaction_type=spec["row_tx_type"],
            vendor_trn=spec.get("vendor_trn"),
            vendor_country=spec.get("vendor_country"),
        )
        merged = _enforce_transaction_direction(merged, spec["row_tx_type"])
        saved = _save_classification_fields(merged, spec["amount"])
        tier = saved.get("review_tier", "review_required")
        if tier == "auto_approve":
            auto_approved += 1
        elif tier == "blocked" or saved.get("blocked_input_vat"):
            blocked += 1
        else:
            review_required += 1

        txn = Transaction(
            company_id=company_id,
            date=spec["trans_date"],
            description=spec["description"],
            amount_aed=spec["amount"],
            vendor_or_customer=spec["vendor"],
            invoice_number=spec["invoice_num"],
            vendor_trn=spec.get("vendor_trn"),
            vat_treatment=saved["vat_treatment"],
            transaction_type=_resolve_saved_transaction_type(
                row_tx_type=spec["row_tx_type"],
                invoice_number=spec["invoice_num"],
            ),
            vat_amount_aed=saved["vat_amount_aed"],
            confidence_score=saved["confidence_score_0_100"],
            ai_reasoning=saved["reasoning"],
            box_number=saved["box_number"],
            classification_flags=saved["flags"],
            is_verified=tier == "auto_approve",
            source="smart_upload",
            source_file_name=filename,
        )
        db_transactions.append(txn)
        normalized_for_compliance.append(
            {
                "row": len(normalized_for_compliance) + 1,
                "date": spec["trans_date"].isoformat(),
                "description": spec["description"],
                "vendor_or_customer": spec["vendor"] or "",
                "amount_aed": spec["amount"],
                "vat_amount_aed": saved["vat_amount_aed"],
                "vat_rate": f"{saved['vat_rate']}%",
                "transaction_type": spec["row_tx_type"],
                "invoice_ref": spec["invoice_num"] or f"ROW-{len(normalized_for_compliance) + 1}",
            }
        )

    db.add_all(db_transactions)
    db.commit()
    for t in db_transactions:
        db.refresh(t)
    _sync_vat_classifications_to_supabase(company_id, db_transactions, "smart_upload")

    return {
        "count": len(db_transactions),
        "classified": len(db_transactions),
        "auto_approved": auto_approved,
        "review_required": review_required,
        "blocked": blocked,
    }, normalized_for_compliance


def _save_advance_row(db: Session, company_id: int, row: Dict[str, Any]) -> Optional[Dict[str, float]]:
    """Persist one advance payment using the same logic as POST /api/advance-payment/save."""
    existing = (
        db.query(AdvancePayment)
        .filter(
            AdvancePayment.company_id == company_id,
            AdvancePayment.order_value == row["order_value"],
            AdvancePayment.advance_amount == row["advance_amount"],
        )
        .first()
    )
    if existing:
        calc = _calculate(
            AdvancePaymentCalcIn(
                order_value=float(existing.order_value),
                advance_amount=float(existing.advance_amount),
                advance_date=existing.advance_date,
                delivery_date=existing.delivery_date,
                vat_rate=float(existing.vat_rate) * 100 if existing.vat_rate <= 1 else float(existing.vat_rate),
            )
        )
        return {"vat_at_advance": calc.vat_at_advance, "vat_at_delivery": calc.vat_at_delivery}

    save_in = AdvancePaymentSaveIn(
        order_value=row["order_value"],
        advance_amount=row["advance_amount"],
        advance_date=row["advance_date"],
        delivery_date=row["delivery_date"],
        vat_rate=row["vat_rate"],
        description=row.get("description"),
    )
    result = _calculate(save_in)
    db.add(
        AdvancePayment(
            company_id=company_id,
            description=(save_in.description or "").strip() or None,
            order_value=save_in.order_value,
            advance_amount=save_in.advance_amount,
            advance_date=save_in.advance_date,
            delivery_date=save_in.delivery_date,
            vat_rate=_normalize_vat_rate(save_in.vat_rate),
            status=result.status,
        )
    )
    return {"vat_at_advance": result.vat_at_advance, "vat_at_delivery": result.vat_at_delivery}


def _process_advance_payments(df: pd.DataFrame, company_id: int, db: Session) -> Dict[str, Any]:
    rows = _parse_advance_rows(df)
    if not rows:
        return {"count": 0, "total_vat_at_advance": 0.0, "total_vat_at_delivery": 0.0}

    total_adv = total_del = 0.0
    saved = 0
    for row in rows:
        try:
            amounts = _save_advance_row(db, company_id, row)
            if amounts:
                total_adv += amounts["vat_at_advance"]
                total_del += amounts["vat_at_delivery"]
                saved += 1
        except HTTPException:
            continue
        except Exception as exc:
            logger.warning("Advance payment row skipped: %s", exc)
            continue
    if saved:
        db.commit()
    return {
        "count": saved,
        "total_vat_at_advance": round(total_adv, 2),
        "total_vat_at_delivery": round(total_del, 2),
    }


@router.post("/")
async def smart_upload(
    file: UploadFile = File(...),
    period: str = Form(""),
    company_trn: str = Form(""),
    entity_type: str = Form(""),
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    lower = file.filename.lower()
    if not lower.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        sheets = _load_workbook_sheets(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read Excel workbook: {exc}") from exc

    if not sheets:
        raise HTTPException(status_code=400, detail="Workbook contains no readable data sheets")

    typed_sheets: List[Tuple[str, str, pd.DataFrame]] = []
    for name, df in sheets.items():
        sheet_type = _detect_sheet_type(df, name)
        if sheet_type:
            typed_sheets.append((name, sheet_type, df))

    if not typed_sheets:
        raise HTTPException(
            status_code=400,
            detail="No recognized sheet types found. Include transaction, advance payment, or CT/ESR columns.",
        )

    resolved_period = period.strip() or _infer_period(list(sheets.keys()), file.filename or "")
    resolved_trn = company_trn.strip() or (company.trn or "")
    resolved_entity = entity_type.strip() or ENTITY_TYPE_LABELS.get(company.entity_type, "Mainland UAE")

    sheets_detected: List[str] = []
    results: Dict[str, Any] = {}
    compliance_txns: List[Dict[str, Any]] = []
    review_id: Optional[str] = None

    tx_totals = {"count": 0, "classified": 0, "auto_approved": 0, "review_required": 0, "blocked": 0}
    adv_totals = {"count": 0, "total_vat_at_advance": 0.0, "total_vat_at_delivery": 0.0}
    ct_summary: Dict[str, Any] = {}
    processed_adv_sheets: set = set()

    for sheet_name, sheet_type, df in typed_sheets:
        if sheet_type == "transactions":
            tx_result, tx_compliance = _process_transactions(
                df, company_id, company.entity_type, db, file.filename or sheet_name
            )
            for key in tx_totals:
                tx_totals[key] += tx_result.get(key, 0)
            compliance_txns.extend(tx_compliance)
            if "transactions" not in sheets_detected:
                sheets_detected.append("transactions")
        elif sheet_type == "advance_payments":
            adv_result = _process_advance_payments(df, company_id, db)
            adv_totals["count"] += adv_result.get("count", 0)
            adv_totals["total_vat_at_advance"] += adv_result.get("total_vat_at_advance", 0)
            adv_totals["total_vat_at_delivery"] += adv_result.get("total_vat_at_delivery", 0)
            processed_adv_sheets.add(sheet_name)
            if "advance_payments" not in sheets_detected:
                sheets_detected.append("advance_payments")
        elif sheet_type == "ct_esr":
            ct_summary.update(_extract_ct_summary(df))
            if "ct_esr" not in sheets_detected:
                sheets_detected.append("ct_esr")

    # Scan every sheet for advance-payment columns (may share workbook with transactions)
    for sheet_name, df in sheets.items():
        if sheet_name in processed_adv_sheets:
            continue
        if _sheet_has_advance_columns(df):
            adv_result = _process_advance_payments(df, company_id, db)
            if adv_result.get("count", 0) > 0:
                adv_totals["count"] += adv_result.get("count", 0)
                adv_totals["total_vat_at_advance"] += adv_result.get("total_vat_at_advance", 0)
                adv_totals["total_vat_at_delivery"] += adv_result.get("total_vat_at_delivery", 0)
                if "advance_payments" not in sheets_detected:
                    sheets_detected.append("advance_payments")

    if "transactions" in sheets_detected or tx_totals["count"] > 0:
        if tx_totals["count"] == 0:
            existing_count = (
                db.query(Transaction)
                .filter(Transaction.company_id == company_id)
                .count()
            )
            tx_totals["count"] = existing_count
            tx_totals["classified"] = existing_count
        results["transactions"] = tx_totals
    if "advance_payments" in sheets_detected or adv_totals["count"] > 0:
        if adv_totals["count"] == 0:
            existing_adv = (
                db.query(AdvancePayment)
                .filter(AdvancePayment.company_id == company_id)
                .count()
            )
            adv_totals["count"] = existing_adv
        if adv_totals["count"] > 0:
            results["advance_payments"] = {
                **adv_totals,
                "total_vat_at_advance": round(adv_totals["total_vat_at_advance"], 2),
                "total_vat_at_delivery": round(adv_totals["total_vat_at_delivery"], 2),
            }
    if ct_summary:
        results["ct_esr"] = ct_summary

    # Compliance review — use all company transactions when a transaction sheet was present
    run_compliance = "transactions" in sheets_detected or tx_totals["count"] > 0
    if run_compliance:
        if not compliance_txns:
            compliance_txns = transactions_for_compliance_from_db(db, company_id)
        if compliance_txns:
            try:
                analysis = _run_compliance_analysis(
                    compliance_txns,
                    resolved_period,
                    resolved_trn,
                    resolved_entity,
                    db,
                    company_id,
                )
                review_id = _save_review_supabase(
                    company_id,
                    resolved_period,
                    resolved_trn,
                    resolved_entity,
                    analysis,
                    db=db,
                    row_count=len(compliance_txns),
                    source="smart_upload",
                )
                es = analysis.get("executive_summary", {})
                results["vat_compliance_review"] = {
                    "compliance_rating": es.get("compliance_rating", "—"),
                    "issues_found": es.get("issues_count", 0),
                    "review_id": review_id,
                    "period": resolved_period,
                    "high_risk_found": analysis.get("high_risk_found", False),
                    "row_count": len(compliance_txns),
                }
                if "transactions" in results:
                    results["transactions"]["compliance_rating"] = es.get("compliance_rating", "—")
                    results["transactions"]["issues_found"] = es.get("issues_count", 0)
                    results["transactions"]["review_id"] = review_id
                    results["transactions"]["period"] = resolved_period
            except Exception as exc:
                logger.warning("Compliance analysis skipped: %s", exc)
                results["vat_compliance_review"] = {
                    "compliance_rating": None,
                    "issues_found": 0,
                    "error": str(exc),
                }
                if "transactions" in results:
                    results["transactions"]["compliance_error"] = str(exc)

    if tx_totals["count"] > 0 or "transactions" in sheets_detected:
        results["vat_return"] = {
            "ready": True,
            "period": resolved_period,
            "message": f"{resolved_period} return ready to generate",
        }
    results["modules_populated"] = {
        "fta_reports": "transactions" in sheets_detected or tx_totals["count"] > 0,
        "supplier_ledger": "transactions" in sheets_detected or tx_totals["count"] > 0,
    }

    also_ready = []
    if "transactions" in sheets_detected:
        also_ready.extend(["/dashboard/vat-classifier", "/dashboard/vat-compliance-review", "/dashboard/vat-return"])
    if "advance_payments" in sheets_detected:
        also_ready.append("/dashboard/advance-payment")
    if "ct_esr" in sheets_detected:
        also_ready.append("/dashboard/corporate-tax")
    also_ready.extend(["/dashboard/fta-reports", "/dashboard/suppliers"])
    also_ready = list(dict.fromkeys(also_ready))

    primary = "/dashboard/vat-classifier"
    if "transactions" not in sheets_detected and "advance_payments" in sheets_detected:
        primary = "/dashboard/advance-payment"
    elif "transactions" not in sheets_detected and "ct_esr" in sheets_detected:
        primary = "/dashboard/corporate-tax"

    try:
        log_ai_audit(
            db,
            company_id=company_id,
            user_email="user",
            action_type="upload",
            feature="smart_upload",
            input_summary=f"Smart upload {file.filename} — sheets: {', '.join(sheets_detected)}",
            output_summary=f"Transactions: {results.get('transactions', {}).get('count', 0)}",
            status="success",
        )
    except Exception:
        pass

    return {
        "filename": file.filename,
        "sheet_count": len(sheets),
        "sheets_detected": sheets_detected,
        "results": results,
        "redirect_hints": {
            "primary": primary,
            "also_ready": also_ready,
        },
    }
