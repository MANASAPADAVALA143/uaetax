"""E-invoicing readiness assessment endpoints."""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from models import Company

router = APIRouter(prefix="/api/einvoicing", tags=["E-Invoicing Readiness"])

Answer = Literal["a", "b", "c"]


class AssessRequest(BaseModel):
    answers: List[Answer] = Field(..., min_length=5, max_length=5)


class GapRow(BaseModel):
    area: str
    status: str
    risk: str
    action: str


class AssessResponse(BaseModel):
    score: int
    phase: str
    deadline: str
    days_remaining: int
    gaps: List[GapRow]
    readiness_label: str


class ExportPdfRequest(BaseModel):
    score: int
    phase: str
    deadline: str
    days_remaining: int
    readiness_label: str
    gaps: List[GapRow]


def _days_until(d: date) -> int:
    return max(0, (d - date.today()).days)


def _score_label(score: int) -> str:
    if score >= 80:
        return "Compliant Ready"
    if score >= 50:
        return "Partially Ready"
    return "Action Required"


def _phase_from_q1(ans: Answer) -> tuple[str, date]:
    if ans == "a":
        return ("Phase 1 - October 2026", date(2026, 10, 1))
    if ans == "b":
        return ("Phase 2 - January 2027", date(2027, 1, 1))
    return ("Currently Not Mandated - monitor updates", date(2027, 1, 1))


def _risk(ans: Answer) -> str:
    return "Low" if ans == "a" else ("Medium" if ans == "b" else "High")


def _status(ans: Answer, labels: tuple[str, str, str]) -> str:
    return {"a": labels[0], "b": labels[1], "c": labels[2]}[ans]


def _assess(answers: List[Answer]) -> AssessResponse:
    points = {"a": 20, "b": 10, "c": 0}
    score = sum(points[a] for a in answers)
    phase, deadline_date = _phase_from_q1(answers[0])
    readiness_label = _score_label(score)
    gaps = [
        GapRow(
            area="ERP Readiness",
            status=_status(
                answers[1],
                (
                    "Structured ERP output enabled",
                    "Partially structured output",
                    "Manual or spreadsheet invoicing",
                ),
            ),
            risk=_risk(answers[1]),
            action=(
                "Configure your ERP to output structured data OR use UAE Tax XML Generator"
                if answers[1] != "a"
                else "Keep ERP mappings tested quarterly for PINT AE updates"
            ),
        ),
        GapRow(
            area="TRN Capture",
            status=_status(
                answers[2],
                (
                    "TRN mandatory in all invoices",
                    "TRN capture is inconsistent",
                    "TRN not consistently collected",
                ),
            ),
            risk=_risk(answers[2]),
            action=(
                "Update your invoice template to make TRN mandatory"
                if answers[2] != "a"
                else "Continue monthly data quality checks for TRN completeness"
            ),
        ),
        GapRow(
            area="ASP Appointment",
            status=_status(
                answers[3],
                ("ASP contracted", "ASP discussions in progress", "ASP onboarding not started"),
            ),
            risk=_risk(answers[3]),
            action=(
                "Review FTA's approved ASP list and sign contract before deadline"
                if answers[3] != "a"
                else "Validate ASP onboarding timeline and test environment access"
            ),
        ),
        GapRow(
            area="XML Generation",
            status=_status(
                answers[4],
                ("PINT AE XML available", "Vendor working on XML support", "PDF-only invoices today"),
            ),
            risk=_risk(answers[4]),
            action=(
                "Use UAE Tax PINT AE XML Generator (coming soon)"
                if answers[4] != "a"
                else "Run periodic PINT AE validation before go-live"
            ),
        ),
    ]
    return AssessResponse(
        score=score,
        phase=phase,
        deadline=deadline_date.isoformat(),
        days_remaining=_days_until(deadline_date),
        gaps=gaps,
        readiness_label=readiness_label,
    )


@router.post("/assess", response_model=AssessResponse)
async def assess_readiness(
    body: AssessRequest,
    company_id: int = Depends(get_current_company_id),
):
    _ = company_id
    return _assess(body.answers)


@router.post("/export-pdf")
async def export_readiness_pdf(
    body: ExportPdfRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

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
    flow = []
    flow.append(Paragraph("UAE E-Invoicing Readiness Report", styles["Title"]))
    flow.append(Spacer(1, 4 * mm))
    flow.append(Paragraph(f"Company: {company.name}", styles["Normal"]))
    flow.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%d %b %Y %H:%M UTC')}", styles["Normal"]))
    flow.append(Spacer(1, 4 * mm))
    flow.append(Paragraph(f"Score: {body.score}/100 ({body.readiness_label})", styles["Heading3"]))
    flow.append(Paragraph(f"Applicable Phase: {body.phase}", styles["Normal"]))
    flow.append(Paragraph(f"Deadline: {body.deadline} ({body.days_remaining} days remaining)", styles["Normal"]))
    flow.append(Spacer(1, 5 * mm))

    table_data = [["Area", "Your Status", "Risk", "Action Required"]]
    for gap in body.gaps:
        table_data.append([gap.area, gap.status, gap.risk, gap.action])
    table = Table(table_data, colWidths=[34 * mm, 48 * mm, 18 * mm, 72 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#4E6B95")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
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
        headers={"Content-Disposition": 'attachment; filename="einvoicing_readiness_report.pdf"'},
    )
