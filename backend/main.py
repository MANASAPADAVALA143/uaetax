"""FastAPI main application"""
import os
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv

from database import engine, Base
from routers.vat_classifier import router as vat_classifier_router
from routers.vat_return import router as vat_return_router
from routers.dashboard import router as dashboard_router
from routers import automations
from routers import corporate_tax
from routers import tax_memo
from routers import invoice_flow
from routers import fta_reports
from routers.auth_router import router as auth_router

# Load .env only in local dev — Railway injects env vars directly
_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)

# SQLite only: auto-create tables on startup (Postgres uses alembic migrations)
if "sqlite" in os.getenv("DATABASE_URL", "sqlite"):
    Base.metadata.create_all(bind=engine)

# ── Lightweight column migrations (idempotent — safe to run on every deploy) ──
# Adds source + source_invoice_id to transactions table if not already present.
def _run_column_migrations():
    _migrations = [
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'vat_classifier'",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL",
    ]
    try:
        with engine.connect() as conn:
            for sql in _migrations:
                try:
                    conn.execute(text(sql))
                except Exception:
                    pass  # Column already exists or unsupported (SQLite)
            conn.commit()
    except Exception:
        pass  # Don't crash startup if migration fails

_run_column_migrations()

app = FastAPI(
    title="GulfTax AI API",
    version="1.0.0",
    description="UAE Tax SaaS — VAT, Corporate Tax, E-Invoicing",
)

app.include_router(auth_router)
app.include_router(vat_classifier_router)
app.include_router(vat_return_router)
app.include_router(dashboard_router)
app.include_router(automations.router, prefix="/api/automations", tags=["automations"])
app.include_router(corporate_tax.router, prefix="/api/ct", tags=["corporate-tax"])
app.include_router(tax_memo.router)  # prefix="/api/tax" defined in router
app.include_router(invoice_flow.router)  # prefix="/api/invoice" defined in router
app.include_router(fta_reports.router)   # prefix="/api/fta" defined in router

# CORS — hardcoded origins + regex fallback for any *.vercel.app deployment
# No env-var override so Railway can never accidentally break this
ALLOWED_ORIGINS = [
    "https://uaetax.vercel.app",
    "https://uaetax-manasapadavala143.vercel.app",
    "https://gulftax.vercel.app",
    "https://uaetax-production.up.railway.app",
    "https://uaetax-production-9b22.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

# Also accept any extra origins from env var (additive, not replacing)
_extra = os.getenv("ALLOWED_ORIGINS", "")
for _o in _extra.split(","):
    _o = _o.strip()
    if _o and _o not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "GulfTax AI API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/health")
async def health_check():
    """Production health check — verifies DB connection and RAG availability."""
    # Check DB
    db_ok = False
    try:
        from database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    # Check RAG (pgvector service)
    rag_ok = False
    try:
        from services.uae_tax_rag_pg import uae_tax_rag
        rag_ok = uae_tax_rag.model is not None
    except Exception:
        pass

    return {
        "status": "ok",
        "backend_url": os.getenv("RAILWAY_BACKEND_URL", "not set"),
        "rag_available": rag_ok,
        "db_connected": db_ok,
        "timestamp": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
