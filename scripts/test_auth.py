#!/usr/bin/env python3
"""
GulfTax AI — Auth smoke test
============================
Tests the full auth + multi-tenancy flow end-to-end:

  Step 1  Sign up a new Supabase user
  Step 2  Confirm we get a JWT session token
  Step 3  Call POST /api/auth/setup-company with that token
  Step 4  Call GET /api/auth/my-companies — verify company appears
  Step 5  Call GET /api/dashboard/summary with X-Company-ID header
  Step 6  Call GET /api/dashboard/summary WITHOUT token  → expect 401
  Step 7  Call GET /api/dashboard/summary with wrong company id → expect 403

Usage:
    pip install httpx python-dotenv
    python scripts/test_auth.py

Environment:
    Copy .env.local.example → .env.local and fill in values, OR set:
        NEXT_PUBLIC_SUPABASE_URL
        NEXT_PUBLIC_SUPABASE_ANON_KEY
        NEXT_PUBLIC_API_URL          (default: http://localhost:8000)
        TEST_EMAIL                   (unique email for this test run)
        TEST_PASSWORD                (≥ 8 chars)
"""

import os
import sys
import json
import httpx
from pathlib import Path

# ── Load .env.local if present ──────────────────────────────────────────────

env_file = Path(__file__).parent.parent / ".env.local"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

# ── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
API_URL = os.environ.get("NEXT_PUBLIC_API_URL", "http://localhost:8000").rstrip("/")

import time
_ts = int(time.time())
TEST_EMAIL = os.environ.get("TEST_EMAIL", f"smoke+{_ts}@gulftax-test.invalid")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "Test1234!")
TEST_COMPANY = f"Smoke Test Co {_ts}"

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"

def check(label: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  {PASS} {label}")
    else:
        print(f"  {FAIL} {label}" + (f": {detail}" if detail else ""))
        sys.exit(1)

def step(n: int, title: str):
    print(f"\nStep {n}: {title}")

# ── Preflight ─────────────────────────────────────────────────────────────────

if not SUPABASE_URL:
    print("ERROR: NEXT_PUBLIC_SUPABASE_URL not set")
    sys.exit(1)
if not SUPABASE_ANON_KEY:
    print("ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY not set")
    sys.exit(1)

print(f"\nGulfTax Auth Smoke Test")
print(f"  API:        {API_URL}")
print(f"  Supabase:   {SUPABASE_URL}")
print(f"  Test email: {TEST_EMAIL}")

# ── Step 1: Sign up ───────────────────────────────────────────────────────────

step(1, "Sign up new Supabase user")
r = httpx.post(
    f"{SUPABASE_URL}/auth/v1/signup",
    headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
    json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    timeout=15,
)
check("HTTP 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
body = r.json()

# ── Step 2: Extract token ─────────────────────────────────────────────────────

step(2, "Extract JWT access token")
token = (body.get("access_token") or
         (body.get("session") or {}).get("access_token"))
check("Token present", bool(token), "email confirmation may be required — disable in Supabase dashboard")

# ── Step 3: Setup company ─────────────────────────────────────────────────────

step(3, f"POST /api/auth/setup-company  ({TEST_COMPANY})")
r = httpx.post(
    f"{API_URL}/api/auth/setup-company",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    json={"company_name": TEST_COMPANY, "trn": None, "emirate": "Dubai", "entity_type": "mainland"},
    timeout=15,
)
check("HTTP 200/201", r.status_code in (200, 201), f"got {r.status_code}: {r.text[:200]}")
company_id = r.json().get("company_id")
check("company_id returned", isinstance(company_id, int), str(r.json()))

# ── Step 4: List companies ────────────────────────────────────────────────────

step(4, "GET /api/auth/my-companies")
r = httpx.get(
    f"{API_URL}/api/auth/my-companies",
    headers={"Authorization": f"Bearer {token}"},
    timeout=15,
)
check("HTTP 200", r.status_code == 200, r.text[:200])
companies = r.json()
check("At least one company", len(companies) >= 1)
names = [c.get("company_name") for c in companies]
check(f"Test company '{TEST_COMPANY}' in list", TEST_COMPANY in names, str(names))

# ── Step 5: Dashboard summary (authenticated) ─────────────────────────────────

step(5, "GET /api/dashboard/summary (authenticated)")
r = httpx.get(
    f"{API_URL}/api/dashboard/summary",
    headers={"Authorization": f"Bearer {token}", "X-Company-ID": str(company_id)},
    timeout=15,
)
check("HTTP 200", r.status_code == 200, r.text[:200])
check("Has 'vat' key", "vat" in r.json(), str(list(r.json().keys())))

# ── Step 6: Dashboard summary (unauthenticated) → 401 ────────────────────────

step(6, "GET /api/dashboard/summary (no token) → 401")
r = httpx.get(f"{API_URL}/api/dashboard/summary", timeout=10)
check("HTTP 401", r.status_code == 401, f"got {r.status_code}: {r.text[:200]}")

# ── Step 7: Dashboard summary (wrong company) → 403 ──────────────────────────

step(7, "GET /api/dashboard/summary (wrong X-Company-ID) → 403")
r = httpx.get(
    f"{API_URL}/api/dashboard/summary",
    headers={"Authorization": f"Bearer {token}", "X-Company-ID": "99999"},
    timeout=10,
)
check("HTTP 403", r.status_code == 403, f"got {r.status_code}: {r.text[:200]}")

# ── Done ──────────────────────────────────────────────────────────────────────

print("\n\033[32mAll 7 steps passed.\033[0m\n")
