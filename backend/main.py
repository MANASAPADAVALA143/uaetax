"""FastAPI main application"""
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

# Always load backend/.env regardless of process cwd and existing env values.
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GulfTax AI API", version="1.0.0")

app.include_router(vat_classifier_router)
app.include_router(vat_return_router)
app.include_router(dashboard_router)
app.include_router(automations.router, prefix="/api/automations", tags=["automations"])
app.include_router(corporate_tax.router, prefix="/api/ct", tags=["corporate-tax"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
