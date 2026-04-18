# 🚀 Start GulfTax AI Servers

## Quick Start Commands

### Terminal 1 - Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Backend will be at:**
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### Terminal 2 - Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

**Frontend will be at:**
- Dashboard: http://localhost:3000/dashboard
- Home Page: http://localhost:3000
- VAT Classifier: http://localhost:3000/dashboard/vat-classifier
- VAT Return: http://localhost:3000/dashboard/vat-return
- Reconciliation: http://localhost:3000/dashboard/reconciliation

## All Localhost URLs

### Frontend (Port 3000)
- **Home:** http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard
- **VAT Classifier:** http://localhost:3000/dashboard/vat-classifier
- **VAT Return:** http://localhost:3000/dashboard/vat-return
- **Reconciliation:** http://localhost:3000/dashboard/reconciliation
- **Settings:** http://localhost:3000/dashboard/settings

### Backend API (Port 8000)
- **API Root:** http://localhost:8000
- **Health Check:** http://localhost:8000/health
- **API Documentation:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### API Endpoints
- **Classify Transaction:** POST http://localhost:8000/api/vat/classify-transaction
- **Classify Bulk:** POST http://localhost:8000/api/vat/classify-bulk
- **Get Transactions:** GET http://localhost:8000/api/vat/transactions/{company_id}
- **Generate Return:** POST http://localhost:8000/api/vat/generate-return
- **Reconcile:** POST http://localhost:8000/api/vat/reconcile/{vat_return_id}
- **Download PDF:** GET http://localhost:8000/api/vat/returns/{return_id}/pdf
- **Download Excel:** GET http://localhost:8000/api/vat/returns/{return_id}/excel

## One-Command Start (Windows)

Create `start.bat`:
```batch
@echo off
start "Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000"
timeout /t 3
start "Frontend" cmd /k "cd frontend && npm run dev"
```

Then just run: `start.bat`

## One-Command Start (Mac/Linux)

Create `start.sh`:
```bash
#!/bin/bash
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000 &
sleep 3
cd frontend && npm run dev
```

Then: `chmod +x start.sh && ./start.sh`
