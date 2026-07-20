-- GulfTax AI — VAT Classifier → Supabase sync columns
-- Project: thwpeujhuqreceqvhpsb
-- Run in Supabase SQL Editor after 005_multitenant_auth_integer.sql

-- Base table may already exist from 005_multitenant_auth_integer.sql
CREATE TABLE IF NOT EXISTS vat_classifications (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT,
  transaction_data JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS amount_aed NUMERIC;
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS vat_treatment TEXT;
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vat_classifications ADD COLUMN IF NOT EXISTS gulftax_transaction_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vat_classifications_company_tx
  ON vat_classifications (company_id, gulftax_transaction_id)
  WHERE gulftax_transaction_id IS NOT NULL;

ALTER TABLE vat_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_company_data_vat" ON vat_classifications;
CREATE POLICY "users_see_company_data_vat" ON vat_classifications
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );
