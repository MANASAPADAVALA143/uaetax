"""Auth endpoints — company setup and membership queries.

POST /api/auth/setup-company  — called by frontend on first register
GET  /api/auth/my-companies   — list all companies for the logged-in user
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import Company, UserCompany

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Request / response models ────────────────────────────────────

class SetupCompanyRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    trn: Optional[str] = Field(default=None, max_length=50)
    trade_licence: Optional[str] = Field(default=None, max_length=100)
    emirate: Optional[str] = Field(default=None, max_length=100)
    entity_type: Optional[str] = Field(default="mainland")


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
