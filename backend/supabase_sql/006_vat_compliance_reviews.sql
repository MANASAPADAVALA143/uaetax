-- GulfTax AI — VAT Compliance Review persistence
-- Project: thwpeujhuqreceqvhpsb
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.vat_compliance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT,
  company_trn TEXT,
  entity_type TEXT,
  compliance_rating TEXT,
  issues_count INTEGER DEFAULT 0,
  net_vat_position NUMERIC(15,2),
  output_vat NUMERIC(15,2),
  input_vat NUMERIC(15,2),
  findings JSONB,
  vat201 JSONB,
  audit_triggers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_compliance_company
  ON public.vat_compliance_reviews(company_id);

ALTER TABLE public.vat_compliance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_company_vat_compliance" ON public.vat_compliance_reviews;
CREATE POLICY "users_see_company_vat_compliance" ON public.vat_compliance_reviews
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()::text)
  );

NOTIFY pgrst, 'reload schema';
