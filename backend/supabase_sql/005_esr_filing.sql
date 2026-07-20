-- GulfTax AI — ESR Filing persistence
-- Project: thwpeujhuqreceqvhpsb
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS esr_filings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  esr_activity TEXT,
  income_test BOOLEAN DEFAULT false,
  employees_test BOOLEAN DEFAULT false,
  assets_test BOOLEAN DEFAULT false,
  filing_status TEXT DEFAULT 'not_started',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_esr_filings_company_year
  ON esr_filings (company_id, financial_year);

ALTER TABLE esr_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_company_esr" ON esr_filings;
CREATE POLICY "users_see_company_esr" ON esr_filings
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );
