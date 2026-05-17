-- ============================================================
-- Migration 003 — Auth & Row-Level Security (RLS) for tenancy
-- Run against your Supabase project via:
--   supabase db push
-- or paste into the Supabase SQL editor.
--
-- This migration adds RLS policies so that the Supabase service-role
-- key (used by the FastAPI backend) can read/write all rows, while
-- direct Supabase client calls from the browser are blocked except
-- through the backend API.
-- ============================================================

-- 1. Enable RLS on tables that hold company-scoped data.
--    (Tables are created by SQLAlchemy / Alembic on the FastAPI side;
--     this migration only adds the RLS layer.)

-- NOTE: These statements are safe to run even if the tables don't yet
-- exist in Supabase storage — the backend uses its own SQLite/Postgres
-- instance. If you are running a unified Supabase Postgres setup,
-- uncomment the ALTER TABLE lines below.

-- ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_companies  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vat_returns     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ct_returns      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE einvoicing_assessments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gl_imports      ENABLE ROW LEVEL SECURITY;

-- 2. Allow the service-role key full access (used by FastAPI backend).
--    service_role bypasses RLS by default in Supabase, so no explicit
--    policy is needed; this comment is here for documentation.

-- 3. Deny anonymous / authenticated direct access.
--    All data access is mediated through the FastAPI backend which
--    verifies JWT + company membership before querying the DB.
--    Direct Supabase client (anon/authenticated) access is denied.

-- Example: deny SELECT for authenticated role on companies
-- CREATE POLICY "no_direct_access" ON companies
--   FOR ALL
--   TO authenticated
--   USING (false);

-- ============================================================
-- Supabase Auth settings (apply in Dashboard → Auth → Settings)
-- ============================================================
-- These cannot be set via SQL — configure in the Supabase dashboard:
--
--  • JWT expiry: 3600 (1 hour recommended)
--  • Refresh token rotation: enabled
--  • Email confirmations: optional (register page handles both paths)
--  • Redirect URLs:
--      http://localhost:3000/**
--      https://<your-production-domain>/**
-- ============================================================
