"""Standalone TRN validation API."""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.vat_enrichment import validate_trn

router = APIRouter(prefix="/api/trn", tags=["TRN Validation"])


class ValidateTRNRequest(BaseModel):
    trn: str = Field(..., description="UAE TRN e.g. 100123456700003")


class ValidateTRNResponse(BaseModel):
    valid: bool
    format_check: bool
    trn: str
    message: Optional[str] = None


@router.post("/validate", response_model=ValidateTRNResponse)
async def api_validate_trn(body: ValidateTRNRequest):
    """Validate UAE TRN format (15 digits, starts with 1)."""
    result = validate_trn(body.trn)
    cleaned = "".join(c for c in body.trn if c.isdigit())
    msg = None
    if not result["valid"]:
        msg = "TRN must be 15 digits starting with 1"
    return ValidateTRNResponse(
        valid=result["valid"],
        format_check=result["format_check"],
        trn=cleaned or body.trn.strip(),
        message=msg,
    )
