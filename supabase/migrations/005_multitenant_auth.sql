-- GulfTax AI standalone — Multi-tenant auth tables (thwpeujhuqreceqvhpsb)
-- ⚠️  FRESH Supabase project ONLY (no existing companies table).
--
-- If you get: "company_id and id are of incompatible types: uuid and integer"
-- → STOP. Use 005_multitenant_auth_integer.sql instead (your DB uses integer PKs).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  trn TEXT,
  country TEXT DEFAULT 'UAE',
  currency TEXT DEFAULT 'AED',
  fiscal_year_start INTEGER DEFAULT 1,
  vat_registered_date DATE,
  plan TEXT DEFAULT 'starter',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

CREATE TABLE IF NOT EXISTS vat_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  period TEXT,
  transaction_data JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vat_return_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  financial_year TEXT,
  revenue NUMERIC,
  taxable_income NUMERIC,
  ct_payable NUMERIC,
  computation_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS einvoice_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  invoice_number TEXT,
  compliance_score INTEGER,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ct_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_companies" ON user_companies
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "users_insert_companies" ON companies
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "users_read_member_companies" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "users_update_member_companies" ON companies
  FOR UPDATE USING (
    id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "users_see_company_data_vat" ON vat_classifications
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "users_see_company_data_returns" ON vat_return_entries
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "users_see_company_data_ct" ON ct_computations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "users_see_company_data_einvoice" ON einvoice_validations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );
