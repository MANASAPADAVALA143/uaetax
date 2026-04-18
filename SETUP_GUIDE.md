# GulfTax AI - Complete Setup Guide

## Quick Start

### 1. Prerequisites Check

```bash
# Check Node.js (need 18+)
node --version

# Check Python (need 3.9+)
python --version

# Check PostgreSQL (need 12+)
psql --version
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb gulftax_ai

# Or using psql:
psql -U postgres
CREATE DATABASE gulftax_ai;
\q
```

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
# Copy env_template.txt to .env and edit:
cp env_template.txt .env
# Then edit .env with your actual values:
# - ANTHROPIC_API_KEY=sk-ant-...
# - DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai
# - FTA_API_KEY=your_key_here

# Initialize database (tables will be created automatically on first run)
# Or use Alembic for migrations:
# alembic init alembic
# alembic revision --autogenerate -m "Initial migration"
# alembic upgrade head
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

### 5. Run the Application

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # If using venv
uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 6. Verify Setup

1. Backend health check: http://localhost:8000/health
2. Frontend: http://localhost:3000
3. API docs: http://localhost:8000/docs

## Environment Variables Reference

### Backend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/gulftax_ai` |
| `FTA_API_KEY` | FTA API key (placeholder) | `your_fta_key` |

### Frontend (.env.local)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## Project Structure

```
gulftax-ai/
├── frontend/
│   ├── app/              # Next.js app router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/        # React components
│   ├── package.json
│   └── .env.local        # Frontend env vars
├── backend/
│   ├── main.py           # FastAPI application
│   ├── models.py         # SQLAlchemy models
│   ├── database.py       # DB configuration
│   ├── requirements.txt
│   ├── .env              # Backend env vars
│   └── alembic.ini       # Migration config
└── rag/
    ├── vector_store.py   # ChromaDB setup
    └── chroma_db/        # Vector DB (auto-created)
```

## Troubleshooting

### Backend Issues

**Database connection error:**
- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in `.env` matches your PostgreSQL setup
- Ensure database exists: `psql -l | grep gulftax_ai`

**Claude API error:**
- Verify ANTHROPIC_API_KEY is set correctly
- Check API key is valid at https://console.anthropic.com/
- Ensure you have API credits

**Import errors:**
- Activate virtual environment: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

### Frontend Issues

**Cannot connect to backend:**
- Verify backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Check CORS settings in `backend/main.py`

**Build errors:**
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Database Issues

**Tables not created:**
- Tables are auto-created on first API call
- Or run: `python -c "from database import engine; from models import Base; Base.metadata.create_all(bind=engine)"`

**Migration issues:**
- Initialize Alembic: `alembic init alembic`
- Create migration: `alembic revision --autogenerate -m "message"`
- Apply: `alembic upgrade head`

## Next Steps

1. Add sample data to database
2. Populate ChromaDB with UAE tax law documents
3. Test VAT classification endpoint
4. Build frontend dashboard components
5. Integrate FTA API (when available)

## Development Commands

```bash
# Backend
cd backend
uvicorn main:app --reload          # Development server
alembic upgrade head               # Run migrations
alembic revision --autogenerate   # Create migration

# Frontend
cd frontend
npm run dev                        # Development server
npm run build                      # Production build
npm run start                      # Production server
npm run lint                       # Lint code
```
