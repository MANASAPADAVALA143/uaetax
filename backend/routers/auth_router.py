"""Auth endpoints — company setup, membership, and settings."""
import secrets
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_company_id, get_current_user
from models import Company, UserCompany

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _default_settings() -> Dict[str, Any]:
    return {
        "auto_classify_threshold": 0.85,
        "flag_entertainment": True,
        "reverse_charge_auto_detect": True,
        "annual_revenue_aed": None,
        "asp_provider": "",
        "peppol_participant_id": "",
        "asp_deadline_reminder": True,
        "notify_30_days": True,
        "notify_15_days": True,
        "notify_7_days": True,
        "alert_email": "",
        "api_key": f"gt_live_{secrets.token_hex(16)}",
        "finreportai_connected": False,
    }


def _merge_settings(raw: Optional[Dict]) -> Dict[str, Any]:
    base = _default_settings()
    if isinstance(raw, dict):
        base.update(raw)
    return base


# ── Request / response models ────────────────────────────────────

class SetupCompanyRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    trn: Optional[str] = Field(default=None, max_length=50)
    trade_licence: Optional[str] = Field(default=None, max_length=100)
    emirate: Optional[str] = Field(default=None, max_length=100)
    entity_type: Optional[str] = Field(default="mainland")
    plan: Optional[str] = Field(default="starter")


class CompanyOut(BaseModel):
    company_id: int
    company_name: str
    trn: Optional[str]
    entity_type: str
    role: str
    created_at: Optional[datetime]


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/setup-company", response_model=CompanyOut)
async def setup_company(
    body: SetupCompanyRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Idempotent — if this Supabase user already has a company, return it.
    Otherwise create a new Company + UserCompany(role='owner').
    company_id is always derived from the verified token, never from the body.
    """
    user_id = user["user_id"]

    # Check for existing membership
    existing = (
        db.query(UserCompany)
        .filter(UserCompany.user_id == user_id)
        .join(Company)
        .first()
    )
    if existing:
        return CompanyOut(
            company_id=existing.company_id,
            company_name=existing.company.name,
            trn=existing.company.trn,
            entity_type=existing.company.entity_type,
            role=existing.role,
            created_at=existing.created_at,
        )

    # Validate TRN uniqueness (skip if blank)
    if body.trn:
        clash = db.query(Company).filter(Company.trn == body.trn).first()
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"A company with TRN '{body.trn}' already exists",
            )

    # Create company
    entity_type = body.entity_type or "mainland"
    company = Company(
        name=body.company_name,
        trn=body.trn or None,
        trade_license_number=body.trade_licence or None,
        entity_type=entity_type,
        vat_registered=True,
        plan=body.plan or "starter",
        settings=_default_settings(),
    )
    db.add(company)
    db.flush()  # get id without committing

    # Create ownership membership
    membership = UserCompany(
        user_id=user_id,
        company_id=company.id,
        role="owner",
    )
    db.add(membership)
    db.commit()
    db.refresh(company)
    db.refresh(membership)

    return CompanyOut(
        company_id=company.id,
        company_name=company.name,
        trn=company.trn,
        entity_type=company.entity_type,
        role="owner",
        created_at=membership.created_at,
    )


@router.get("/my-companies", response_model=List[CompanyOut])
async def my_companies(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all companies the logged-in user belongs to, with their role."""
    rows = (
        db.query(UserCompany)
        .filter(UserCompany.user_id == user["user_id"])
        .join(Company)
        .all()
    )
    return [
        CompanyOut(
            company_id=r.company_id,
            company_name=r.company.name,
            trn=r.company.trn,
            entity_type=r.company.entity_type,
            role=r.role,
            created_at=r.created_at,
        )
        for r in rows
    ]


class CompanyProfileOut(BaseModel):
    company_id: int
    company_name: str
    trn: Optional[str]
    country: str
    currency: str
    fiscal_year_start: int
    vat_registered_date: Optional[date]
    entity_type: str
    plan: str
    annual_revenue_aed: Optional[float]
    settings: Dict[str, Any]


class UpdateCompanyProfileRequest(BaseModel):
    company_name: Optional[str] = None
    trn: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    fiscal_year_start: Optional[int] = Field(None, ge=1, le=12)
    vat_registered_date: Optional[date] = None


class UpdateCompanySettingsRequest(BaseModel):
    settings: Dict[str, Any]


def _company_profile(company: Company) -> CompanyProfileOut:
    return CompanyProfileOut(
        company_id=company.id,
        company_name=company.name,
        trn=company.trn,
        country=company.country or "UAE",
        currency=company.currency or "AED",
        fiscal_year_start=company.fiscal_year_start or 1,
        vat_registered_date=company.vat_registered_date,
        entity_type=company.entity_type,
        plan=company.plan or "starter",
        annual_revenue_aed=company.annual_revenue_aed,
        settings=_merge_settings(company.settings),
    )


@router.get("/company-profile", response_model=CompanyProfileOut)
async def get_company_profile(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _company_profile(company)


@router.patch("/company-profile", response_model=CompanyProfileOut)
async def update_company_profile(
    body: UpdateCompanyProfileRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if body.trn:
        import re
        if not re.match(r"^1\d{14}$", body.trn.replace(" ", "")):
            raise HTTPException(status_code=400, detail="TRN must be 15 digits starting with 1")

    if body.company_name is not None:
        company.name = body.company_name
    if body.trn is not None:
        company.trn = body.trn or None
    if body.country is not None:
        company.country = body.country
    if body.currency is not None:
        company.currency = body.currency
    if body.fiscal_year_start is not None:
        company.fiscal_year_start = body.fiscal_year_start
    if body.vat_registered_date is not None:
        company.vat_registered_date = body.vat_registered_date

    db.commit()
    db.refresh(company)
    return _company_profile(company)


@router.patch("/company-settings", response_model=CompanyProfileOut)
async def update_company_settings(
    body: UpdateCompanySettingsRequest,
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    merged = _merge_settings(company.settings)
    merged.update(body.settings)

    if "annual_revenue_aed" in body.settings:
        company.annual_revenue_aed = body.settings.get("annual_revenue_aed")

    company.settings = merged
    db.commit()
    db.refresh(company)
    return _company_profile(company)


@router.post("/regenerate-api-key", response_model=CompanyProfileOut)
async def regenerate_api_key(
    company_id: int = Depends(get_current_company_id),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    merged = _merge_settings(company.settings)
    merged["api_key"] = f"gt_live_{secrets.token_hex(16)}"
    company.settings = merged
    db.commit()
    db.refresh(company)
    return _company_profile(company)
