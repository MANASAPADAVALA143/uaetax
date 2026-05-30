"""
Seed the local SQLite database with a demo company so the dashboard
works without connecting to production Supabase PostgreSQL.

Run once:  python seed_local.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, Base, SessionLocal
from models import Company, UserCompany, Transaction
from datetime import date

# Create all tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    # ── Company ────────────────────────────────────────────────────
    company = db.query(Company).filter(Company.id == 1).first()
    if not company:
        company = Company(
            id=1,
            name="AI Baraka Trading LLC",
            trade_license_number="DED-2024-001234",
            trn="100487230000015",
            entity_type="mainland",
            vat_registered=True,
            ct_registered=True,
            annual_revenue_aed=5_000_000,
        )
        db.add(company)
        db.commit()
        print("✅ Created company: AI Baraka Trading LLC (id=1)")
    else:
        print(f"✅ Company already exists: {company.name}")

    # ── Sample transactions so VAT Classifier tab isn't empty ──────
    txn_count = db.query(Transaction).filter(Transaction.company_id == 1).count()
    if txn_count == 0:
        sample_txns = [
            Transaction(company_id=1, date=date(2025,4,1), description="Office rent — Business Bay",
                        amount_aed=45000, vat_treatment="standard_rated", transaction_type="purchase",
                        vat_amount_aed=2250, confidence_score=95, is_verified=True, source="vat_classifier"),
            Transaction(company_id=1, date=date(2025,4,5), description="Consulting fees — KPMG",
                        amount_aed=55000, vat_treatment="standard_rated", transaction_type="purchase",
                        vat_amount_aed=2750, confidence_score=93, is_verified=True, source="vat_classifier"),
            Transaction(company_id=1, date=date(2025,4,10), description="Software license — Microsoft",
                        amount_aed=12000, vat_treatment="standard_rated", transaction_type="purchase",
                        vat_amount_aed=600, confidence_score=97, is_verified=True, source="vat_classifier"),
            Transaction(company_id=1, date=date(2025,4,15), description="Professional services sales",
                        amount_aed=120000, vat_treatment="standard_rated", transaction_type="sale",
                        vat_amount_aed=6000, confidence_score=96, is_verified=True, source="vat_classifier"),
            Transaction(company_id=1, date=date(2025,5,1), description="Advisory retainer — Q2",
                        amount_aed=85000, vat_treatment="standard_rated", transaction_type="sale",
                        vat_amount_aed=4250, confidence_score=94, is_verified=True, source="vat_classifier"),
        ]
        db.add_all(sample_txns)
        db.commit()
        print(f"✅ Added {len(sample_txns)} sample transactions")
    else:
        print(f"✅ Transactions already exist ({txn_count} records)")

    print("\n🚀 Local database ready. Open http://localhost:3000/dashboard")

finally:
    db.close()
