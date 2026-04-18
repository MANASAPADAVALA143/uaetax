# Database Migrations Guide

## Quick Start (Supabase)

1. Create a project at [supabase.com](https://supabase.com) and note the database password you set.
2. **Settings → Database → Connection string → URI** — copy the URI (shape: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`).
3. In `backend/.env`, set:
   ```env
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
   ```
   If connections fail from your machine, append `?sslmode=require` (or use the URI Supabase gives you if it already includes SSL query params).

4. **Run migrations:**
   ```bash
   cd backend
   alembic upgrade head
   ```

You should see revisions `001_initial` and `002_verify_dashboard` applied (`alembic current` shows `002_verify_dashboard` at head).

## Local PostgreSQL (optional)

1. **Ensure database exists:**
   ```bash
   createdb gulftax_ai
   ```

2. **Set DATABASE_URL in `.env`:**
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai
   ```

3. **Run migrations** (same as above):
   ```bash
   cd backend
   alembic upgrade head
   ```

## Current Models

### Company
- Stores company/entity information
- Fields: name, trade_license_number, trn, entity_type, free_zone_name, is_qfzp, vat_registered, ct_registered

### Transaction
- Stores individual transactions
- Fields: date, description, amount_aed, vendor_or_customer, invoice_number, vat_treatment, vat_amount_aed, confidence_score, ai_reasoning, is_verified

### VATReturn
- Stores VAT return periods and all 8 FTA boxes
- Fields: period_start, period_end, box1-8 values, status

### ReconciliationResult
- Stores reconciliation results between invoices and VAT returns
- Fields: totals, differences, mismatches (JSON), status

## Migration Workflow

1. Modify models in `models.py`
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review generated migration file
4. Apply: `alembic upgrade head`

## Rollback

If you need to rollback:

```bash
# See current revision
alembic current

# Rollback one step
alembic downgrade -1

# Rollback to specific revision
alembic downgrade <revision_id>
```
