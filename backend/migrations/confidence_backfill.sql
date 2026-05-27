-- ============================================================
-- GulfTax AI — Confidence score backfill
-- Run this in Supabase SQL Editor
--
-- IMPORTANT CORRECTIONS vs the version you were given:
--   1. Column is "confidence" (not "ai_confidence")
--   2. "risk_score" is NOT a DB column — computed from risk_flags JSON
--   3. Values must be 0.93 (not 93) — frontend multiplies by 100 for %
-- ============================================================

-- Step 1: Preview what will change (run this first to verify)
SELECT
  id,
  vendor_name,
  overall_risk,
  confidence AS current_confidence,
  LEAST(COALESCE(
    (SELECT SUM(CASE f->>'severity' WHEN 'HIGH' THEN 25 WHEN 'MEDIUM' THEN 12 WHEN 'LOW' THEN 4 ELSE 0 END)
     FROM jsonb_array_elements(
       CASE WHEN risk_flags IS NOT NULL THEN risk_flags::jsonb ELSE '[]'::jsonb END
     ) f),
    0
  ), 100) AS computed_risk_score
FROM invoices
ORDER BY id DESC
LIMIT 20;

-- Step 2: Apply the backfill
-- Updates ALL invoices, not just null ones, so re-runs are safe
WITH risk_scores AS (
  SELECT
    id,
    LEAST(COALESCE(
      (SELECT SUM(
         CASE f->>'severity'
           WHEN 'HIGH'   THEN 25
           WHEN 'MEDIUM' THEN 12
           WHEN 'LOW'    THEN 4
           ELSE 0
         END
       )
       FROM jsonb_array_elements(
         CASE WHEN risk_flags IS NOT NULL
              THEN risk_flags::jsonb
              ELSE '[]'::jsonb
         END
       ) AS f),
      0
    ), 100) AS score
  FROM invoices
)
UPDATE invoices i
SET confidence = CASE
    WHEN rs.score < 30 THEN 0.93   -- e.g. Etisalat (low score, dup flag)
    WHEN rs.score < 45 THEN 0.89   -- e.g. Emaar (auto-approved, clean)
    WHEN rs.score < 55 THEN 0.84   -- e.g. Pinnacle (free zone + travel)
    WHEN rs.score < 75 THEN 0.78   -- e.g. Desert Rose (entertainment blocked)
    WHEN rs.score < 85 THEN 0.74   -- e.g. Al Fajr (urgency + gmail)
    ELSE                  0.72     -- e.g. Opulent (ghost + no TRN)
  END
FROM risk_scores rs
WHERE i.id = rs.id;

-- Step 3: Verify results
SELECT
  id,
  vendor_name,
  overall_risk,
  ROUND(confidence * 100) AS confidence_pct,
  status
FROM invoices
ORDER BY id DESC
LIMIT 10;
