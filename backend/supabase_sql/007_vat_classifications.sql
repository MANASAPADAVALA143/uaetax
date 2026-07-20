-- GulfTax AI — VAT Classifier Supabase sync (source column)
-- Project: thwpeujhuqreceqvhpsb
-- Run in Supabase SQL Editor after 004_vat_classifications.sql

ALTER TABLE public.vat_classifications
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'single';

NOTIFY pgrst, 'reload schema';
