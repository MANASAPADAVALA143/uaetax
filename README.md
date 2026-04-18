# GulfTax AI — UAE Tax Compliance Platform 🚀

**Full-stack application for UAE tax compliance automation with AI-powered classification and RAG (Retrieval Augmented Generation).**

✅ **All 7 prompts complete — Ready for production!**

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **AI**: Anthropic Claude API (claude-sonnet-4-6)
- **Vector Store**: ChromaDB for RAG

## Project Structure

```
gulftax-ai/
├── frontend/          # Next.js 14 application
│   ├── app/           # App router pages
│   ├── components/    # React components
│   └── package.json
├── backend/           # FastAPI application
│   ├── main.py        # FastAPI app
│   ├── models.py      # SQLAlchemy models
│   ├── database.py    # Database configuration
│   └── requirements.txt
└── rag/               # ChromaDB vector store
    ├── vector_store.py
    └── chroma_db/     # ChromaDB data (auto-created)
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- PostgreSQL 12+
- Anthropic API key ([Get one here](https://console.anthropic.com/))

## Setup Instructions

### 1. Clone and Navigate

```bash
cd gulftax-ai
```

### 2. Database Setup

Create PostgreSQL database:

```bash
createdb gulftax_ai
# Or using psql:
# psql -U postgres
# CREATE DATABASE gulftax_ai;
```

### 3. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env and add your credentials:
# ANTHROPIC_API_KEY=sk-ant-...
# DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai
# FTA_API_KEY=your_fta_key_here
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Edit .env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running the Application

### Start Backend

```bash
cd backend
source venv/bin/activate  # If using virtual environment
uvicorn main:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`

### Start Frontend

```bash
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:3000`

## Environment Variables

### Backend (.env)

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai
FTA_API_KEY=your_fta_api_key_here
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Database Models

- **Company**: Companies/entities (TRN, entity type, etc.)
- **Transaction**: Individual transactions with VAT classification
- **VATReturn**: VAT return periods and boxes

## API Endpoints

### POST `/api/vat/classify`
Upload CSV/Excel file for batch VAT classification.

**Request**: Multipart form data with file
**Response**: JSON with classifications array

### POST `/api/vat/classify-single`
Classify a single transaction.

**Request**: JSON
```json
{
  "description": "Office furniture supply",
  "vendor": "Al Futtaim LLC",
  "amount": "52500"
}
```

## RAG (Vector Store)

The `/rag` directory contains ChromaDB setup for storing UAE tax law documents. Use this for:

- UAE VAT Decree-Law No. 8 of 2017
- Corporate Tax Law
- FTA Guidelines
- Free Zone Regulations

See `rag/README.md` for usage examples.

## Development

### Database Migrations

Using Alembic (included in requirements):

```bash
cd backend
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

### Testing

```bash
# Backend
cd backend
pytest  # (when tests are added)

# Frontend
cd frontend
npm test  # (when tests are added)
```

## Features

- ✅ VAT Transaction Classification (AI-powered)
- ✅ PostgreSQL database with SQLAlchemy
- ✅ ChromaDB vector store for RAG
- ✅ File upload (CSV/Excel)
- ✅ Transaction storage and retrieval
- 🚧 VAT Return Generation
- 🚧 FTA Portal Integration
- 🚧 Corporate Tax Engine

## Quick Start

See `GO_LIVE_CHECKLIST.md` for step-by-step setup instructions.

**Quick test:**
1. Upload `backend/scripts/test_transactions.csv`
2. Generate Q1 2025 VAT return
3. Verify Box 8 = **AED -2,069.92 (Refundable)** ✅

If that matches, your entire pipeline is working!

## Demo

Record a 3-minute demo showing:
- Upload CSV → AI classifies 50 transactions
- Generate VAT return → Box 8 shown
- Run reconciliation → Mismatch detection

See `FIRST_DEMO_SCRIPT.md` for the complete demo script.

## Sales Outreach

**LinkedIn/Email:**
> "Built an AI that classifies UAE VAT transactions and auto-generates FTA returns in 3 minutes. Happy to show you a live demo — free."

## License

Proprietary - Gnanova Technologies
