"""Automation bridge endpoints for n8n integrations."""
import hashlib
import hmac
import json
import os
import secrets
from datetime import UTC, datetime
from typing import Any, Dict, List, Literal, Optional
from urllib.error import URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Company, EInvoicingAssessment, GLImportResult

router = APIRouter()


class EInvoicingAssessmentPayload(BaseModel):
    """Inbound payload contract from n8n readiness workflow."""
    company_id: int
    assessed_at: datetime
    overall_score: int
    readiness_level: Literal["not_ready", "partial", "ready"]
    gap_areas: List[Any]
    recommendations: List[Any]
    raw_payload: Dict[str, Any]


class TriggerPayload(BaseModel):
    """Payload used to manually trigger n8n assessment workflow."""
    company_id: int
    triggered_at: str


class GLImportSummaryPayload(BaseModel):
    total_rows: int
    standard_rated: int
    zero_rated: int
    exempt: int
    reverse_charge: int
    out_of_scope: int
    needs_review: int
    est_vat_on_sales_aed: int
    est_input_tax_aed: int
    rc_vat_aed: int
    estimated_box8_aed: int


class GLImportPayload(BaseModel):
    summary: GLImportSummaryPayload
    parsed_rows: List[Any]
    parse_date: str
    company_id: Optional[int] = None


def _verify_n8n_signature(secret: str, body: bytes, received: str) -> bool:
    """HMAC-SHA256 hex over raw body, or plain shared secret (n8n Code without crypto)."""
    if not received or not received.strip():
        return False
    received = received.strip()
    expected_hex = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected_hex, received.lower()):
        return True
    return secrets.compare_digest(received, secret)


def _parse_iso_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    return datetime.fromisoformat(normalized)


@router.post("/n8n/inbound/einvoicing_assessed")
async def inbound_einvoicing_assessed(
    request: Request,
    db: Session = Depends(get_db),
    x_n8n_signature: Optional[str] = Header(default=None, alias="X-N8N-Signature"),
):
    """Receive signed n8n readiness assessments and upsert by UTC calendar day."""
    secret = os.getenv("N8N_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="N8N_WEBHOOK_SECRET is not configured")
    if not x_n8n_signature:
        raise HTTPException(status_code=401, detail="Invalid signature")

    raw_body = await request.body()
    if not _verify_n8n_signature(secret=secret, body=raw_body, received=x_n8n_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = EInvoicingAssessmentPayload.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    assessed_at_utc = payload.assessed_at.astimezone(UTC)
    assessment_date_utc = assessed_at_utc.date()

    existing = (
        db.query(EInvoicingAssessment)
        .filter(EInvoicingAssessment.company_id == payload.company_id)
        .filter(func.date(func.timezone("UTC", EInvoicingAssessment.assessed_at)) == assessment_date_utc)
        .order_by(EInvoicingAssessment.assessed_at.desc())
        .first()
    )

    if existing:
        existing.assessed_at = assessed_at_utc
        existing.overall_score = payload.overall_score
        existing.readiness_level = payload.readiness_level
        existing.gap_areas = payload.gap_areas
        existing.recommendations = payload.recommendations
        existing.raw_payload = payload.raw_payload
        assessment = existing
    else:
        assessment = EInvoicingAssessment(
            company_id=payload.company_id,
            assessed_at=assessed_at_utc,
            overall_score=payload.overall_score,
            readiness_level=payload.readiness_level,
            gap_areas=payload.gap_areas,
            recommendations=payload.recommendations,
            raw_payload=payload.raw_payload,
        )
        db.add(assessment)

    db.commit()
    db.refresh(assessment)
    return {"status": "ok", "assessment_id": assessment.id}


@router.get("/assessments")
async def list_assessments(
    company_id: int = Depends(get_current_company_id),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List recent e-invoicing assessments for a company."""
    rows = (
        db.query(EInvoicingAssessment)
        .filter(EInvoicingAssessment.company_id == company_id)
        .order_by(EInvoicingAssessment.assessed_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": row.id,
            "company_id": row.company_id,
            "assessed_at": row.assessed_at,
            "overall_score": row.overall_score,
            "readiness_level": row.readiness_level,
            "gap_areas": row.gap_areas,
            "recommendations": row.recommendations,
            "raw_payload": row.raw_payload,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/trigger/{company_id}")
async def trigger_einvoicing_assessment(
    company_id: int,
    _verified_id: int = Depends(get_current_company_id),
):
    """Trigger n8n e-invoicing workflow for a company."""
    webhook_url = os.getenv("N8N_EINVOICING_WEBHOOK_URL")
    if not webhook_url:
        raise HTTPException(status_code=500, detail="N8N_EINVOICING_WEBHOOK_URL is not configured")

    payload = TriggerPayload(
        company_id=company_id,
        triggered_at=datetime.utcnow().isoformat(),
    )
    data = json.dumps(payload.model_dump()).encode("utf-8")

    req = UrlRequest(
        url=webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=10):
            pass
    except URLError as exc:
        raise HTTPException(status_code=502, detail="Failed to reach n8n") from exc

    return {"status": "triggered"}


@router.post("/n8n/inbound/gl_imported")
async def inbound_gl_imported(
    request: Request,
    db: Session = Depends(get_db),
    x_n8n_signature: Optional[str] = Header(default=None, alias="X-N8N-Signature"),
):
    """Receive signed GL classification payloads from n8n and persist import runs."""
    secret = os.getenv("N8N_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="N8N_WEBHOOK_SECRET is not configured")
    if not x_n8n_signature:
        raise HTTPException(status_code=401, detail="Invalid signature")

    raw_body = await request.body()
    if not _verify_n8n_signature(secret=secret, body=raw_body, received=x_n8n_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = GLImportPayload.model_validate_json(raw_body)
        parse_date = _parse_iso_datetime(payload.parse_date)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid GL import payload") from exc

    row = GLImportResult(
        company_id=payload.company_id,
        parse_date=parse_date,
        total_rows=payload.summary.total_rows,
        standard_rated=payload.summary.standard_rated,
        zero_rated=payload.summary.zero_rated,
        exempt=payload.summary.exempt,
        reverse_charge=payload.summary.reverse_charge,
        out_of_scope=payload.summary.out_of_scope,
        needs_review=payload.summary.needs_review,
        est_vat_on_sales_aed=payload.summary.est_vat_on_sales_aed,
        est_input_tax_aed=payload.summary.est_input_tax_aed,
        rc_vat_aed=payload.summary.rc_vat_aed,
        estimated_box8_aed=payload.summary.estimated_box8_aed,
        parsed_rows=payload.parsed_rows,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"status": "ok", "import_id": row.id, "rows_saved": row.total_rows}


@router.get("/gl-imports")
async def list_gl_imports(
    verified_company_id: int = Depends(get_current_company_id),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List recent GL import runs for the verified company."""
    rows = (
        db.query(GLImportResult)
        .filter(GLImportResult.company_id == verified_company_id)
        .order_by(GLImportResult.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": row.id,
            "company_id": row.company_id,
            "parse_date": row.parse_date,
            "total_rows": row.total_rows,
            "standard_rated": row.standard_rated,
            "zero_rated": row.zero_rated,
            "exempt": row.exempt,
            "reverse_charge": row.reverse_charge,
            "out_of_scope": row.out_of_scope,
            "needs_review": row.needs_review,
            "est_vat_on_sales_aed": row.est_vat_on_sales_aed,
            "est_input_tax_aed": row.est_input_tax_aed,
            "rc_vat_aed": row.rc_vat_aed,
            "estimated_box8_aed": row.estimated_box8_aed,
            "created_at": row.created_at,
        }
        for row in rows
    ]
