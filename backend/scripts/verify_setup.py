"""Verify that all GulfTax AI components are set up correctly."""
import os
import sys
from pathlib import Path

# Ensure backend/ is on path so imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def check_backend():
    """Check backend imports and core components."""
    print("Checking backend setup...")

    checks = {
        "Database models": False,
        "RAG system (pgvector)": False,
        "VAT Classifier router": False,
        "VAT Return router": False,
        "Database connection": False,
    }

    try:
        from models import Company, Transaction, VATReturn, ReconciliationResult  # noqa: F401
        checks["Database models"] = True
        print("  [OK] Database models imported")
    except Exception as e:
        print(f"  [FAIL] Database models: {e}")

    try:
        from services.uae_tax_rag_pg import uae_tax_rag
        ready = uae_tax_rag.model is not None
        checks["RAG system (pgvector)"] = ready
        status = "OK — model loaded" if ready else "WARN — model not loaded (check SUPABASE_URL)"
        print(f"  [{status}] RAG system (pgvector)")
    except Exception as e:
        print(f"  [FAIL] RAG system: {e}")

    try:
        from routers.vat_classifier import router as vat_classifier_router  # noqa: F401
        checks["VAT Classifier router"] = True
        print("  [OK] VAT Classifier router imported")
    except Exception as e:
        print(f"  [FAIL] VAT Classifier router: {e}")

    try:
        from routers.vat_return import router as vat_return_router  # noqa: F401
        checks["VAT Return router"] = True
        print("  [OK] VAT Return router imported")
    except Exception as e:
        print(f"  [FAIL] VAT Return router: {e}")

    try:
        from database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["Database connection"] = True
        print("  [OK] Database connection successful")
    except Exception as e:
        print(f"  [FAIL] Database connection: {e}")
        print("     Make sure DATABASE_URL is set and the DB is reachable")

    return all(checks.values())


def check_test_data():
    """Check test data files exist."""
    print("\nChecking test data files...")

    backend_root = Path(__file__).resolve().parent
    files = [
        backend_root / "test_transactions.csv",
        backend_root / "test_transactions_freezone.csv",
    ]

    all_exist = True
    for fp in files:
        if fp.exists():
            lines = len(fp.read_text().splitlines()) - 1  # exclude header
            print(f"  [OK] {fp.name} ({lines} transactions)")
        else:
            print(f"  [FAIL] {fp.name} not found at {fp}")
            all_exist = False

    return all_exist


def check_environment():
    """Check required environment variables."""
    print("\nChecking environment variables...")

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    required = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "DATABASE_URL": os.getenv("DATABASE_URL"),
        "SUPABASE_URL": os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    }

    optional = {
        "RAILWAY_BACKEND_URL": os.getenv("RAILWAY_BACKEND_URL"),
        "SUPABASE_JWT_SECRET": os.getenv("SUPABASE_JWT_SECRET"),
    }

    all_set = True
    for key, value in required.items():
        if value:
            masked = value[:12] + "..." if len(value) > 12 else value
            print(f"  [OK] {key}: {masked}")
        else:
            print(f"  [FAIL] {key}: Not set  ← REQUIRED")
            all_set = False

    for key, value in optional.items():
        if value:
            masked = value[:12] + "..." if len(value) > 12 else value
            print(f"  [OK] {key}: {masked}")
        else:
            print(f"  [WARN] {key}: Not set  (optional but recommended)")

    return all_set


def main():
    """Run all setup checks."""
    print("=" * 60)
    print("GulfTax AI — Setup Verification")
    print("=" * 60)

    backend_ok = check_backend()
    test_data_ok = check_test_data()
    env_ok = check_environment()

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    if backend_ok and test_data_ok and env_ok:
        print("[SUCCESS] All checks passed! System is ready.")
        print("\nNext steps:")
        print("1. Apply pgvector migration: paste supabase/migrations/004_pgvector_rag.sql in Supabase SQL editor")
        print("2. Ingest UAE law PDFs: python backend/scripts/ingest_to_pgvector.py")
        print("3. Start backend: cd backend && uvicorn main:app --reload")
        print("4. Start frontend: npm run dev  (from project root)")
        print("5. Upload test_transactions.csv to /dashboard/vat-classifier")
    else:
        print("[WARNING] Some checks failed. See details above.")
        if not env_ok:
            print("\n  → Copy backend/env.example → backend/.env and fill in values")
        if not backend_ok:
            print("\n  → Install dependencies: pip install -r requirements.txt")
            print("  → Run migrations: alembic upgrade head")
        if not test_data_ok:
            print("\n  → Generate test data: python backend/scripts/generate_test_data.py")

    print("=" * 60)


if __name__ == "__main__":
    main()
