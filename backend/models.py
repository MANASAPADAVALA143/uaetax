"""SQLAlchemy database models for GulfTax AI"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, JSON, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Company(Base):
    """Company/Entity model"""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    trade_license_number = Column(String(100), unique=True, index=True)
    trn = Column(String(50), unique=True, index=True)  # Tax Registration Number
    entity_type = Column(String(50), nullable=False)  # mainland / free_zone / designated_zone
    free_zone_name = Column(String(255), nullable=True)  # If applicable
    is_qfzp = Column(Boolean, default=False)  # Qualifying Free Zone Person
    vat_registered = Column(Boolean, default=False)
    ct_registered = Column(Boolean, default=False)  # Corporate Tax registered
    annual_revenue_aed = Column(Float, nullable=True)
    asp_appointed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="company")
    vat_returns = relationship("VATReturn", back_populates="company")
    reconciliation_results = relationship("ReconciliationResult", back_populates="company")
    audit_logs = relationship("AuditLog", back_populates="company")


class Transaction(Base):
    """Transaction model"""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=False)
    amount_aed = Column(Float, nullable=False)
    vendor_or_customer = Column(String(255))
    invoice_number = Column(String(100))
    vat_treatment = Column(String(50), nullable=True)  # standard_rated / zero_rated / exempt / out_of_scope / reverse_charge
    transaction_type = Column(String(20), nullable=False, default="sale")  # sale | purchase
    vat_amount_aed = Column(Float, default=0.0)
    confidence_score = Column(Float)  # AI confidence score (0-100)
    ai_reasoning = Column(Text)  # AI reasoning text
    is_verified = Column(Boolean, default=False)  # Manual verification flag
    verification_history = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="transactions")


class VATReturn(Base):
    """VAT Return model"""
    __tablename__ = "vat_returns"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    box1_standard_rated_supplies = Column(Float, default=0.0)
    box2_vat_on_supplies = Column(Float, default=0.0)
    box3_zero_rated_supplies = Column(Float, default=0.0)
    box4_exempt_supplies = Column(Float, default=0.0)
    box5_total_taxable_supplies = Column(Float, default=0.0)
    box6_taxable_expenses = Column(Float, default=0.0)
    box7_vat_on_expenses = Column(Float, default=0.0)
    box8_vat_payable_or_refundable = Column(Float, default=0.0)
    status = Column(String(50), default="draft")  # draft / submitted / filed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="vat_returns")
    reconciliation_results = relationship("ReconciliationResult", back_populates="vat_return")


class ReconciliationResult(Base):
    """Reconciliation Result model"""
    __tablename__ = "reconciliation_results"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    vat_return_id = Column(Integer, ForeignKey("vat_returns.id"), nullable=True, index=True)
    total_invoices_aed = Column(Float, default=0.0)
    total_output_vat_aed = Column(Float, default=0.0)
    vat_return_output_aed = Column(Float, default=0.0)
    difference_aed = Column(Float, default=0.0)
    mismatches = Column(JSON)  # JSON array of mismatch details
    status = Column(String(50), default="matched")  # matched / mismatch_found
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="reconciliation_results")
    vat_return = relationship("VATReturn", back_populates="reconciliation_results")


class AuditLog(Base):
    """Append-only activity log for dashboard and compliance trail."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor = Column(String(255), nullable=False, default="system")
    action = Column(String(500), nullable=False)
    entity = Column(String(255), nullable=True)

    company = relationship("Company", back_populates="audit_logs")
