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
from routers.auth_router import router as auth_router

# Load .env only in local dev — Railway injects env vars directly
_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)

# SQLite only: auto-create tables on startup (Postgres uses alembic migrations)
if "sqlite" in os.getenv("DATABASE_URL", "sqlite"):
    Base.metadata.create_all(bind=engine)

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

# CORS — allow production frontend + local dev
# Authorization and X-Company-ID must be in allow_headers for auth to work
_default_origins = (
    "https://uaetax-production.up.railway.app,"
    "http://localhost:3000,"
    "http://localhost:3001,"
    "http://127.0.0.1:3000,"
    "http://127.0.0.1:3001"
)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "X-Company-ID", "Content-Type", "X-N8N-Signature", "Accept", "*"],
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
