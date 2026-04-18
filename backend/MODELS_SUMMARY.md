# SQLAlchemy Models Summary

## Overview

All models are defined in `models.py` with proper relationships and indexes.

## Models

### 1. Company

**Table:** `companies`

**Fields:**
- `id` (Integer, PK)
- `name` (String 255, required, indexed)
- `trade_license_number` (String 100, unique, indexed)
- `trn` (String 50, unique, indexed) - Tax Registration Number
- `entity_type` (String 50, required) - mainland / free_zone / designated_zone
- `free_zone_name` (String 255, nullable) - If applicable
- `is_qfzp` (Boolean, default=False) - Qualifying Free Zone Person
- `vat_registered` (Boolean, default=False)
- `ct_registered` (Boolean, default=False) - Corporate Tax registered
- `created_at` (DateTime, timezone-aware, auto-set)

**Relationships:**
- `transactions` - One-to-many with Transaction
- `vat_returns` - One-to-many with VATReturn
- `reconciliation_results` - One-to-many with ReconciliationResult

### 2. Transaction

**Table:** `transactions`

**Fields:**
- `id` (Integer, PK)
- `company_id` (Integer, FK to companies, required, indexed)
- `date` (Date, required, indexed)
- `description` (Text, required)
- `amount_aed` (Float, required)
- `vendor_or_customer` (String 255, nullable)
- `invoice_number` (String 100, nullable)
- `vat_treatment` (String 50, nullable) - standard_rated / zero_rated / exempt / out_of_scope / reverse_charge
- `vat_amount_aed` (Float, default=0.0)
- `confidence_score` (Float, nullable) - AI confidence (0-100)
- `ai_reasoning` (Text, nullable) - AI reasoning text
- `is_verified` (Boolean, default=False) - Manual verification flag
- `created_at` (DateTime, timezone-aware, auto-set)

**Relationships:**
- `company` - Many-to-one with Company

### 3. VATReturn

**Table:** `vat_returns`

**Fields:**
- `id` (Integer, PK)
- `company_id` (Integer, FK to companies, required, indexed)
- `period_start` (Date, required)
- `period_end` (Date, required)
- `box1_standard_rated_supplies` (Float, default=0.0)
- `box2_vat_on_supplies` (Float, default=0.0)
- `box3_zero_rated_supplies` (Float, default=0.0)
- `box4_exempt_supplies` (Float, default=0.0)
- `box5_total_taxable_supplies` (Float, default=0.0)
- `box6_taxable_expenses` (Float, default=0.0)
- `box7_vat_on_expenses` (Float, default=0.0)
- `box8_vat_payable_or_refundable` (Float, default=0.0)
- `status` (String 50, default="draft") - draft / submitted / filed
- `created_at` (DateTime, timezone-aware, auto-set)

**Relationships:**
- `company` - Many-to-one with Company
- `reconciliation_results` - One-to-many with ReconciliationResult

### 4. ReconciliationResult

**Table:** `reconciliation_results`

**Fields:**
- `id` (Integer, PK)
- `company_id` (Integer, FK to companies, required, indexed)
- `vat_return_id` (Integer, FK to vat_returns, nullable, indexed)
- `total_invoices_aed` (Float, default=0.0)
- `total_output_vat_aed` (Float, default=0.0)
- `vat_return_output_aed` (Float, default=0.0)
- `difference_aed` (Float, default=0.0)
- `mismatches` (JSON, nullable) - JSON array of mismatch details
- `status` (String 50, default="matched") - matched / mismatch_found
- `created_at` (DateTime, timezone-aware, auto-set)

**Relationships:**
- `company` - Many-to-one with Company
- `vat_return` - Many-to-one with VATReturn

## Indexes

All primary keys and foreign keys are automatically indexed. Additional indexes:
- `companies.name` - For company name searches
- `companies.trade_license_number` - Unique index
- `companies.trn` - Unique index
- `transactions.date` - For date range queries
- `transactions.company_id` - For company-specific queries

## Usage Examples

### Create a Company

```python
from models import Company
from database import SessionLocal

db = SessionLocal()
company = Company(
    name="Al Baraka Trading LLC",
    trade_license_number="123456",
    trn="100123456700003",
    entity_type="mainland",
    vat_registered=True,
    ct_registered=True
)
db.add(company)
db.commit()
```

### Create a Transaction

```python
from models import Transaction
from datetime import date

transaction = Transaction(
    company_id=1,
    date=date(2025, 1, 15),
    description="Office furniture supply",
    amount_aed=52500.0,
    vendor_or_customer="Al Futtaim LLC",
    invoice_number="INV-001",
    vat_treatment="standard_rated",
    vat_amount_aed=2625.0,
    confidence_score=99.0,
    ai_reasoning="Office furniture is standard rated in UAE mainland",
    is_verified=False
)
db.add(transaction)
db.commit()
```

### Create a VAT Return

```python
from models import VATReturn
from datetime import date

vat_return = VATReturn(
    company_id=1,
    period_start=date(2025, 1, 1),
    period_end=date(2025, 3, 31),
    box1_standard_rated_supplies=842500.0,
    box2_vat_on_supplies=42125.0,
    box3_zero_rated_supplies=420000.0,
    box4_exempt_supplies=35000.0,
    box5_total_taxable_supplies=1297500.0,
    box6_taxable_expenses=155400.0,
    box7_vat_on_expenses=7770.0,
    box8_vat_payable_or_refundable=42180.0,
    status="draft"
)
db.add(vat_return)
db.commit()
```

## Migration Status

✅ Initial migration created: `001_initial_migration.py`
✅ All tables defined with proper relationships
✅ Indexes configured
✅ Foreign key constraints set

To apply migrations:
```bash
cd backend
alembic upgrade head
```
