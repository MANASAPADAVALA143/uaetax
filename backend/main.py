"""FastAPI main application"""
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import engine, Base
from routers.vat_classifier import router as vat_classifier_router
from routers.vat_return import router as vat_return_router
from routers.dashboard import router as dashboard_router
from routers import automations
from routers import corporate_tax

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

app.include_router(vat_classifier_router)
app.include_router(vat_return_router)
app.include_router(dashboard_router)
app.include_router(automations.router, prefix="/api/automations", tags=["automations"])
app.include_router(corporate_tax.router, prefix="/api/ct", tags=["corporate-tax"])

# CORS — allow production frontend + local dev
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
