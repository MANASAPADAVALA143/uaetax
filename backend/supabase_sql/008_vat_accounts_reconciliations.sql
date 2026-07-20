-- GulfTax AI — VAT Reconciliation vs Accounts (GL tie-out)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.vat_accounts_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT,
  company_trn TEXT,
  gl_input_vat NUMERIC(15,2) DEFAULT 0,
  gl_output_vat NUMERIC(15,2) DEFAULT 0,
  return_input_vat NUMERIC(15,2) DEFAULT 0,
  return_output_vat NUMERIC(15,2) DEFAULT 0,
  net_difference NUMERIC(15,2) DEFAULT 0,
  is_reconciled BOOLEAN DEFAULT FALSE,
  transactions JSONB,
  discrepancies JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_accounts_recon_company
  ON public.vat_accounts_reconciliations(company_id);

ALTER TABLE public.vat_accounts_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_company_vat_accounts_recon" ON public.vat_accounts_reconciliations;
CREATE POLICY "users_see_company_vat_accounts_recon" ON public.vat_accounts_reconciliations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

NOTIFY pgrst, 'reload schema';
