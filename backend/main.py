"""FastAPI main application"""
import os
import traceback
import warnings
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from routers.einvoicing import router as einvoicing_router
from routers.einvoicing_readiness import router as einvoicing_readiness_router
from routers.corporatetax_routes import router as corporatetax_spec_router
from routers.trn_validator import router as trn_validator_router
from routers.advance_payment import router as advance_payment_router
from routers.esr_filing import router as esr_filing_router
from routers.vat_compliance_review import router as vat_compliance_review_router
from routers.smart_upload import router as smart_upload_router
from routers.vat_accounts_recon import router as vat_accounts_recon_router

# Load repo-root .env only in local dev — Railway injects env vars directly
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)

LOCAL_DEV = os.getenv("LOCAL_DEV", "false").lower() in ("1", "true", "yes")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

if LOCAL_DEV and ENVIRONMENT == "production":
    raise RuntimeError(
        "FATAL: LOCAL_DEV=true is not allowed in production. "
        "Set LOCAL_DEV=false in your production .env"
    )

if LOCAL_DEV:
    warnings.warn(
        "WARNING: LOCAL_DEV=true — auth bypass active. Never deploy with this setting.",
        RuntimeWarning,
        stacklevel=1,
    )

# SQLite only: auto-create tables on startup (Postgres uses alembic migrations)
if "sqlite" in os.getenv("DATABASE_URL", "sqlite"):
    Base.metadata.create_all(bind=engine)

# ── Lightweight column migrations (idempotent — safe to run on every deploy) ──
def _run_column_migrations():
    is_sqlite = "sqlite" in os.getenv("DATABASE_URL", "sqlite")

    def _existing_columns(conn, table: str) -> set[str]:
        if is_sqlite:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            return {row[1] for row in rows}
        rows = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :table"
            ),
            {"table": table},
        ).fetchall()
        return {row[0] for row in rows}

    def _add_column(conn, table: str, column: str, ddl: str) -> None:
        if column in _existing_columns(conn, table):
            return
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

    try:
        with engine.connect() as conn:
            _add_column(
                conn,
                "transactions",
                "source",
                "source VARCHAR(50) DEFAULT 'vat_classifier'",
            )
            _add_column(
                conn,
                "transactions",
                "source_invoice_id",
                "source_invoice_id INTEGER",
            )
            _add_column(conn, "transactions", "box_number", "box_number INTEGER")
            flags_type = "TEXT" if is_sqlite else "JSONB"
            _add_column(conn, "transactions", "classification_flags", f"classification_flags {flags_type}")
            _add_column(conn, "transactions", "source_file_name", "source_file_name VARCHAR(255)")
            _add_column(conn, "transactions", "vendor_trn", "vendor_trn VARCHAR(50)")
            metadata_type = "TEXT" if is_sqlite else "JSONB"
            _add_column(conn, "transactions", "source_metadata", f"source_metadata {metadata_type}")
            _add_column(conn, "companies", "country", "country VARCHAR(50) DEFAULT 'UAE'")
            _add_column(conn, "companies", "currency", "currency VARCHAR(10) DEFAULT 'AED'")
            _add_column(
                conn,
                "companies",
                "fiscal_year_start",
                "fiscal_year_start INTEGER DEFAULT 1",
            )
            _add_column(conn, "companies", "vat_registered_date", "vat_registered_date DATE")
            _add_column(conn, "companies", "plan", "plan VARCHAR(50) DEFAULT 'starter'")
            settings_type = "TEXT DEFAULT '{}'" if is_sqlite else "JSONB DEFAULT '{}'"
            _add_column(conn, "companies", "settings", f"settings {settings_type}")
            _add_column(conn, "vat_returns", "box9_standard_rated_purchases", "box9_standard_rated_purchases FLOAT DEFAULT 0.0")
            _add_column(conn, "vat_returns", "box10_zero_rated_purchases", "box10_zero_rated_purchases FLOAT DEFAULT 0.0")
            _add_column(conn, "vat_returns", "box11_exempt_purchases", "box11_exempt_purchases FLOAT DEFAULT 0.0")
            if is_sqlite:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS advance_payments (
                            id INTEGER PRIMARY KEY,
                            company_id INTEGER NOT NULL,
                            description VARCHAR(255),
                            order_value FLOAT NOT NULL,
                            advance_amount FLOAT NOT NULL,
                            advance_date DATE NOT NULL,
                            delivery_date DATE NOT NULL,
                            vat_rate FLOAT NOT NULL DEFAULT 0.05,
                            status VARCHAR(30) NOT NULL DEFAULT 'vat_due_this_period',
                            created_at DATETIME
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS advance_payments (
                            id SERIAL PRIMARY KEY,
                            company_id INTEGER NOT NULL,
                            description VARCHAR(255),
                            order_value DOUBLE PRECISION NOT NULL,
                            advance_amount DOUBLE PRECISION NOT NULL,
                            advance_date DATE NOT NULL,
                            delivery_date DATE NOT NULL,
                            vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0.05,
                            status VARCHAR(30) NOT NULL DEFAULT 'vat_due_this_period',
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        )
                        """
                    )
                )
            if is_sqlite:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS related_party_transactions (
                            id INTEGER PRIMARY KEY,
                            company_id INTEGER NOT NULL,
                            party_name VARCHAR(255) NOT NULL,
                            party_relationship VARCHAR(100) NOT NULL DEFAULT 'Related party',
                            transaction_type VARCHAR(100) NOT NULL DEFAULT 'Services',
                            amount_aed FLOAT NOT NULL DEFAULT 0.0,
                            arms_length_aed FLOAT,
                            method VARCHAR(50) NOT NULL DEFAULT 'TNMM',
                            doc_status VARCHAR(20) NOT NULL DEFAULT 'partial',
                            notes VARCHAR(500),
                            created_at DATETIME
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS related_party_transactions (
                            id SERIAL PRIMARY KEY,
                            company_id INTEGER NOT NULL,
                            party_name VARCHAR(255) NOT NULL,
                            party_relationship VARCHAR(100) NOT NULL DEFAULT 'Related party',
                            transaction_type VARCHAR(100) NOT NULL DEFAULT 'Services',
                            amount_aed DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                            arms_length_aed DOUBLE PRECISION,
                            method VARCHAR(50) NOT NULL DEFAULT 'TNMM',
                            doc_status VARCHAR(20) NOT NULL DEFAULT 'partial',
                            notes VARCHAR(500),
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        )
                        """
                    )
                )
            conn.commit()
    except Exception:
        pass  # Don't crash startup if migration fails

_run_column_migrations()

app = FastAPI(
    title="UAE Tax API",
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
app.include_router(einvoicing_router)
app.include_router(einvoicing_readiness_router)
app.include_router(advance_payment_router)
app.include_router(esr_filing_router)
app.include_router(vat_compliance_review_router)
app.include_router(smart_upload_router)
app.include_router(vat_accounts_recon_router)
app.include_router(corporatetax_spec_router)
app.include_router(trn_validator_router)

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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch ALL unhandled exceptions — return JSON with CORS headers so browser never sees a bare CORS error."""
    origin = request.headers.get("origin", "")
    tb = traceback.format_exc()
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}", "traceback": tb[-2000:]},
    )
    response.headers["Access-Control-Allow-Origin"] = origin or "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.get("/")
async def root():
    return {"message": "UAE Tax API", "status": "running"}


@app.get("/health")
async def health():
    import anthropic as _ant
    try:
        _key = os.getenv("ANTHROPIC_API_KEY", "")
        return {
            "status": "healthy",
            "anthropic_version": _ant.__version__,
            "api_key_set": bool(_key) and len(_key) > 10,
            "allowed_origins": ALLOWED_ORIGINS,
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


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
