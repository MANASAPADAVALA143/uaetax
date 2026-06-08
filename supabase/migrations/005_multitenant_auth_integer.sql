-- GulfTax AI — Multi-tenant tables (INTEGER company_id)
-- Use this version when companies.id is already INTEGER (Alembic/FastAPI schema).
-- Project: thwpeujhuqreceqvhpsb
--
-- DO NOT run 005_multitenant_auth.sql (UUID version) on this database.

-- ── Extend existing companies table (safe if columns already exist) ──
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UAE';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AED';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_year_start INTEGER DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_registered_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- ── Satellite tables (INTEGER FK → companies.id) ─────────────────
CREATE TABLE IF NOT EXISTS vat_classifications (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT,
  transaction_data JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vat_return_entries (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT,
  source TEXT,
  net_amount NUMERIC DEFAULT 0,
  vat_amount NUMERIC DEFAULT 0,
  vat_treatment TEXT,
  box_number INTEGER,
  art54_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ct_computations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  financial_year TEXT,
  revenue NUMERIC,
  taxable_income NUMERIC,
  ct_payable NUMERIC,
  computation_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS einvoice_validations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number TEXT,
  compliance_score INTEGER,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ───────────────────────────────────────────
-- user_companies.user_id is stored as text (Supabase UUID string)

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ct_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_companies" ON user_companies;
CREATE POLICY "users_own_companies" ON user_companies
  FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "users_insert_companies" ON companies;
CREATE POLICY "users_insert_companies" ON companies
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "users_read_member_companies" ON companies;
CREATE POLICY "users_read_member_companies" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "users_update_member_companies" ON companies;
CREATE POLICY "users_update_member_companies" ON companies
  FOR UPDATE USING (
    id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "users_see_company_data_vat" ON vat_classifications;
CREATE POLICY "users_see_company_data_vat" ON vat_classifications
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "users_see_company_data_returns" ON vat_return_entries;
CREATE POLICY "users_see_company_data_returns" ON vat_return_entries
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "users_see_company_data_ct" ON ct_computations;
CREATE POLICY "users_see_company_data_ct" ON ct_computations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "users_see_company_data_einvoice" ON einvoice_validations;
CREATE POLICY "users_see_company_data_einvoice" ON einvoice_validations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );
