-- ============================================================
-- GulfTax AI — Invoice deduplication migration
-- Run this in Supabase SQL Editor (once only)
-- ============================================================

-- Step 1: Remove duplicate invoice rows, keeping the oldest (lowest id)
DELETE FROM invoices
WHERE id NOT IN (
  SELECT MIN(id)
  FROM invoices
  GROUP BY company_id, invoice_number, vendor_name, total_aed
);

-- Step 2: Create unique index to enforce dedup at DB level
-- ON CONFLICT DO NOTHING in the app layer + this index = bulletproof dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_dedup
ON invoices(company_id, invoice_number, vendor_name, total_aed)
WHERE invoice_number IS NOT NULL
  AND vendor_name   IS NOT NULL
  AND total_aed     IS NOT NULL;

-- Step 3: Backfill ai_confidence on invoices (confidence score variance)
-- Overwrites uniform 95% values with risk-adjusted scores
UPDATE invoices
SET confidence = CASE
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN f->>'severity' = 'HIGH' THEN 25
                               WHEN f->>'severity' = 'MEDIUM' THEN 12
                               WHEN f->>'severity' = 'LOW' THEN 4
                               ELSE 0 END)
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(risk_flags::jsonb) = 'array'
                    THEN risk_flags::jsonb
                    ELSE '[]'::jsonb END
             ) AS f)
    ) < 20 THEN 0.96
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN f->>'severity' = 'HIGH' THEN 25
                               WHEN f->>'severity' = 'MEDIUM' THEN 12
                               WHEN f->>'severity' = 'LOW' THEN 4
                               ELSE 0 END)
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(risk_flags::jsonb) = 'array'
                    THEN risk_flags::jsonb
                    ELSE '[]'::jsonb END
             ) AS f)
    ) < 35 THEN 0.89
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN f->>'severity' = 'HIGH' THEN 25
                               WHEN f->>'severity' = 'MEDIUM' THEN 12
                               WHEN f->>'severity' = 'LOW' THEN 4
                               ELSE 0 END)
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(risk_flags::jsonb) = 'array'
                    THEN risk_flags::jsonb
                    ELSE '[]'::jsonb END
             ) AS f)
    ) < 50 THEN 0.84
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN f->>'severity' = 'HIGH' THEN 25
                               WHEN f->>'severity' = 'MEDIUM' THEN 12
                               WHEN f->>'severity' = 'LOW' THEN 4
                               ELSE 0 END)
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(risk_flags::jsonb) = 'array'
                    THEN risk_flags::jsonb
                    ELSE '[]'::jsonb END
             ) AS f)
    ) < 70 THEN 0.77
    ELSE 0.65
    END
WHERE confidence = 0.95 OR confidence IS NULL;

-- Step 4: Verify
SELECT
  COUNT(*)                                        AS total_invoices,
  COUNT(DISTINCT (company_id, invoice_number,
                  vendor_name, total_aed))        AS unique_keys,
  AVG(confidence)                                 AS avg_confidence
FROM invoices;
