"""E-Invoicing / Peppol PINT AE API endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id
from services.einvoicing_service import (
    calculate_phase,
    compute_readiness,
    generate_pint_ae_xml,
    validate_invoice,
)

router = APIRouter(prefix="/api/einvoicing", tags=["E-Invoicing"])


class CalculatePhaseRequest(BaseModel):
    annual_revenue_aed: float = Field(..., ge=0, description="Annual revenue in AED")


class ValidateInvoiceRequest(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    seller_trn: Optional[str] = None
    buyer_trn: Optional[str] = None
    net_amount: Optional[float] = None
    vat_amount: Optional[float] = None
    gross_amount: Optional[float] = None
    vat_category: Optional[str] = None
    vat_rate: Optional[float] = None
    xml_content: Optional[str] = None
    is_b2b: bool = True


class GenerateXmlRequest(BaseModel):
    invoice_number: str
    invoice_date: str
    seller_trn: str
    buyer_trn: str
    net_amount: float = Field(..., gt=0)
    vat_amount: float = Field(..., ge=0)
    gross_amount: float = Field(..., gt=0)


@router.post("/calculate-phase")
async def api_calculate_phase(
    body: CalculatePhaseRequest,
    company_id: int = Depends(get_current_company_id),
):
    """Determine e-invoicing phase from annual revenue."""
    return calculate_phase(body.annual_revenue_aed)


@router.post("/validate")
async def api_validate_invoice(
    body: ValidateInvoiceRequest,
    company_id: int = Depends(get_current_company_id),
):
    """Validate invoice fields against PINT AE mandatory requirements."""
    return validate_invoice(
        invoice_number=body.invoice_number,
        invoice_date=body.invoice_date,
        seller_trn=body.seller_trn,
        buyer_trn=body.buyer_trn,
        net_amount=body.net_amount,
        vat_amount=body.vat_amount,
        gross_amount=body.gross_amount,
        vat_category=body.vat_category,
        vat_rate=body.vat_rate,
        xml_content=body.xml_content,
        is_b2b=body.is_b2b,
    )


@router.post("/validate-xml")
async def api_validate_xml_upload(
    file: UploadFile = File(...),
    is_b2b: bool = Form(default=True),
    company_id: int = Depends(get_current_company_id),
):
    """Validate an uploaded UBL XML invoice file."""
    content = await file.read()
    try:
        xml_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded XML")
    return validate_invoice(xml_content=xml_content, is_b2b=is_b2b)


@router.get("/readiness/{company_id}")
async def api_readiness(
    company_id: int,
    auth_company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    """Run ASP readiness checks for the selected company."""
    if company_id != auth_company_id:
        raise HTTPException(status_code=403, detail="Access denied to this company")
    try:
        return compute_readiness(db, company_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/generate-xml")
async def api_generate_xml(
    body: GenerateXmlRequest,
    company_id: int = Depends(get_current_company_id),
):
    """Generate PINT AE compliant UBL 2.1 Invoice XML."""
    expected_gross = round(body.net_amount + body.vat_amount, 2)
    if abs(body.gross_amount - expected_gross) > 0.02:
        raise HTTPException(
            status_code=400,
            detail=f"Gross amount must equal net + VAT ({expected_gross:.2f})",
        )
    xml = generate_pint_ae_xml(
        invoice_number=body.invoice_number,
        invoice_date=body.invoice_date,
        seller_trn=body.seller_trn,
        buyer_trn=body.buyer_trn,
        net_amount=body.net_amount,
        vat_amount=body.vat_amount,
        gross_amount=body.gross_amount,
    )
    filename = f"invoice_{body.invoice_number.replace('/', '-')}.xml"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
