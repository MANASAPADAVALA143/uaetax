"""Verify that all components are set up correctly"""
import os
import sys

def check_backend():
    """Check backend setup"""
    print("Checking backend setup...")
    
    checks = {
        "Database models": False,
        "RAG system": False,
        "VAT Classifier router": False,
        "VAT Return router": False,
        "Database connection": False,
    }
    
    try:
        from models import Company, Transaction, VATReturn, ReconciliationResult
        checks["Database models"] = True
        print("  [OK] Database models imported")
    except Exception as e:
        print(f"  [FAIL] Database models: {e}")
    
    try:
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from rag.uae_tax_rag import UAETaxRAG
        checks["RAG system"] = True
        print("  [OK] RAG system imported")
    except Exception as e:
        print(f"  [FAIL] RAG system: {e}")
    
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from routers.vat_classifier import router as vat_classifier_router
        checks["VAT Classifier router"] = True
        print("  [OK] VAT Classifier router imported")
    except Exception as e:
        print(f"  [FAIL] VAT Classifier router: {e}")
    
    try:
        from routers.vat_return import router as vat_return_router
        checks["VAT Return router"] = True
        print("  [OK] VAT Return router imported")
    except Exception as e:
        print(f"  [FAIL] VAT Return router: {e}")
    
    try:
        from database import get_db, engine
        # Try to connect
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        checks["Database connection"] = True
        print("  [OK] Database connection successful")
    except Exception as e:
        print(f"  [FAIL] Database connection: {e}")
        print("     Make sure PostgreSQL is running and DATABASE_URL is set")
    
    return all(checks.values())


def check_test_data():
    """Check test data files exist"""
    print("\nChecking test data files...")
    
    files = [
        "backend/scripts/test_transactions.csv",
        "backend/scripts/test_transactions_freezone.csv",
    ]
    
    all_exist = True
    for file in files:
        if os.path.exists(file):
            # Count lines
            with open(file, 'r') as f:
                lines = len(f.readlines()) - 1  # Exclude header
            print(f"  [OK] {file} ({lines} transactions)")
        else:
            print(f"  [FAIL] {file} not found")
            all_exist = False
    
    return all_exist


def check_environment():
    """Check environment variables"""
    print("\nChecking environment variables...")
    
    from dotenv import load_dotenv
    load_dotenv()
    
    checks = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "DATABASE_URL": os.getenv("DATABASE_URL"),
    }
    
    all_set = True
    for key, value in checks.items():
        if value:
            masked = value[:10] + "..." if len(value) > 10 else value
            print(f"  [OK] {key}: {masked}")
        else:
            print(f"  [FAIL] {key}: Not set")
            all_set = False
    
    return all_set


def main():
    """Run all checks"""
    print("=" * 60)
    print("GulfTax AI Setup Verification")
    print("=" * 60)
    
    backend_ok = check_backend()
    test_data_ok = check_test_data()
    env_ok = check_environment()
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    if backend_ok and test_data_ok and env_ok:
        print("[SUCCESS] All checks passed! System is ready for testing.")
        print("\nNext steps:")
        print("1. Start backend: cd backend && uvicorn main:app --reload")
        print("2. Start frontend: cd frontend && npm run dev")
        print("3. Upload test_transactions.csv to VAT Classifier")
    else:
        print("[WARNING] Some checks failed. Please fix the issues above.")
        if not env_ok:
            print("\n  → Set up .env file in backend/ directory")
        if not backend_ok:
            print("\n  → Install dependencies: pip install -r requirements.txt")
        if not test_data_ok:
            print("\n  → Generate test data: python backend/scripts/generate_test_data.py")
    
    print("=" * 60)


if __name__ == "__main__":
    main()
