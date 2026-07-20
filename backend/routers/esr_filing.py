"""ESR Filing API — Supabase-backed persistence and PDF report."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Company

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/esr", tags=["ESR Filing"])


def _get_supabase():
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


class EsrSaveRequest(BaseModel):
    company_id: Optional[int] = None
    financial_year: str = Field(..., min_length=4, max_length=4)
    esr_activity: str = ""
    income_test: bool = False
    employees_test: bool = False
    assets_test: bool = False
    filing_status: str = Field(default="not_started", pattern="^(not_started|in_progress|filed)$")
    notes: Optional[str] = None


class EsrGenerateReportRequest(BaseModel):
    financial_year: str = Field(..., min_length=4, max_length=4)
    esr_activity: str = ""
    income_test: bool = False
    employees_test: bool = False
    assets_test: bool = False
    filing_status: str = "not_started"


def _overall_esr_status(income: bool, employees: bool, assets: bool, filing_status: str) -> str:
    if filing_status == "filed":
        return "PASS"
    if income and employees and assets:
        return "PASS"
    if income or employees or assets:
        return "FILING REQUIRED"
    return "FAIL"


def _test_label(passed: bool) -> str:
    return "PASS" if passed else "FAIL"


@router.get("/status")
async def get_esr_status(
    company_id: int = Depends(get_current_company_id),
    financial_year: str = Query(default=str(datetime.now().year - 1)),
    db: Session = Depends(get_db),
):
    _ = db
    sb = _get_supabase()
    if not sb:
        return {"found": False, "financial_year": financial_year}

    try:
        res = (
            sb.table("esr_filings")
            .select("*")
            .eq("company_id", company_id)
            .eq("financial_year", financial_year)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return {"found": False, "financial_year": financial_year}
        row = rows[0]
        ui_state = {}
        if row.get("notes"):
            try:
                ui_state = json.loads(row["notes"])
            except json.JSONDecodeError:
                ui_state = {"raw_notes": row["notes"]}
        return {"found": True, "financial_year": financial_year, "record": row, "ui_state": ui_state}
    except Exception as exc:
        logger.warning("ESR status fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not load ESR status from Supabase") from exc


@router.post("/save")
async def save_esr_filing(
    body: EsrSaveRequest,
    company_id: int = Depends(get_current_company_id),
):
    if body.company_id is not None and body.company_id != company_id:
        raise HTTPException(status_code=403, detail="company_id does not match active company")

    sb = _get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "company_id": company_id,
        "financial_year": body.financial_year,
        "esr_activity": body.esr_activity,
        "income_test": body.income_test,
        "employees_test": body.employees_test,
        "assets_test": body.assets_test,
        "filing_status": body.filing_status,
        "notes": body.notes,
        "updated_at": now,
    }

    try:
        existing = (
            sb.table("esr_filings")
            .select("id")
            .eq("company_id", company_id)
            .eq("financial_year", body.financial_year)
            .limit(1)
            .execute()
        )
        if existing.data:
            row_id = existing.data[0]["id"]
            sb.table("esr_filings").update(payload).eq("id", row_id).execute()
        else:
            payload["created_at"] = now
            sb.table("esr_filings").insert(payload).execute()
        return {"ok": True, "financial_year": body.financial_year, "filing_status": body.filing_status}
    except Exception as exc:
        logger.warning("ESR save failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not save ESR filing to Supabase") from exc


@router.post("/generate-report")
async def generate_esr_report(
    body: EsrGenerateReportRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    overall = _overall_esr_status(
        body.income_test, body.employees_test, body.assets_test, body.filing_status
    )

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()
    flow: List[Any] = []
    flow.append(Paragraph("UAE Economic Substance Regulations — Position Summary", styles["Title"]))
    flow.append(Spacer(1, 4 * mm))
    flow.append(Paragraph(f"Company: {company.name}", styles["Normal"]))
    flow.append(Paragraph(f"Financial year: {body.financial_year}", styles["Normal"]))
    flow.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}", styles["Normal"]))
    flow.append(Spacer(1, 5 * mm))
    flow.append(Paragraph(f"Declared activity: {body.esr_activity or '—'}", styles["Normal"]))
    flow.append(Paragraph(f"Filing status: {body.filing_status.replace('_', ' ').title()}", styles["Normal"]))
    flow.append(Spacer(1, 5 * mm))

    table_data = [
        ["Substance test", "Result"],
        ["Income / directed & managed in UAE", _test_label(body.income_test)],
        ["Employees / CIGA in UAE", _test_label(body.employees_test)],
        ["Assets / adequacy in UAE", _test_label(body.assets_test)],
        ["Overall ESR status", overall],
    ]
    table = Table(table_data, colWidths=[110 * mm, 60 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#4E6B95")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F8FAFF"), colors.white]),
            ]
        )
    )
    flow.append(table)
    doc.build(flow)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="esr_report_{body.financial_year}.pdf"'},
    )
