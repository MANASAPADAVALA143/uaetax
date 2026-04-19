#!/bin/bash
# GulfTax AI Quick Start Script

echo "🚀 GulfTax AI - Quick Start"
echo "============================"

# Check if PostgreSQL is running
echo ""
echo "1. Checking PostgreSQL..."
if command -v pg_isready &> /dev/null; then
    if pg_isready -q; then
        echo "   ✅ PostgreSQL is running"
    else
        echo "   ❌ PostgreSQL is not running. Please start it first."
        exit 1
    fi
else
    echo "   ⚠️  pg_isready not found. Skipping check."
fi

# Check if database exists
echo ""
echo "2. Checking database..."
if psql -lqt | cut -d \| -f 1 | grep -qw gulftax_ai; then
    echo "   ✅ Database 'gulftax_ai' exists"
else
    echo "   ⚠️  Database 'gulftax_ai' not found. Creating..."
    createdb gulftax_ai
    echo "   ✅ Database created"
fi

# Backend setup
echo ""
echo "3. Setting up backend..."
cd backend

if [ ! -f .env ]; then
    echo "   ⚠️  .env file not found. Creating from template..."
    cp env_template.txt .env
    echo "   ⚠️  Please edit backend/.env and add:"
    echo "      - ANTHROPIC_API_KEY=sk-ant-..."
    echo "      - DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai"
    echo ""
    read -p "   Press Enter after you've edited .env..."
fi

if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python -m venv venv
fi

echo "   Activating virtual environment..."
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate

echo "   Installing dependencies..."
pip install -q -r requirements.txt

echo "   Running migrations..."
alembic upgrade head

echo "   ✅ Backend ready"
cd ..

# Frontend setup (repo root)
echo ""
echo "4. Setting up frontend..."
if [ ! -f .env.local ]; then
    echo "   Creating .env.local..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
fi

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install --silent
fi

echo "   ✅ Frontend ready"

# Test data check
echo ""
echo "5. Checking test data..."
if [ -f "backend/scripts/test_transactions.csv" ]; then
    TRANS_COUNT=$(tail -n +2 backend/scripts/test_transactions.csv | wc -l)
    echo "   ✅ test_transactions.csv found ($TRANS_COUNT transactions)"
else
    echo "   ⚠️  test_transactions.csv not found. Generating..."
    cd backend/scripts
    python generate_test_data.py
    cd ../..
fi

echo ""
echo "============================"
echo "✅ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Start backend:  cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "2. Start frontend: npm run dev   (from repo root)"
echo "3. Open browser:   http://localhost:3000/dashboard"
echo ""
echo "Test: Upload backend/scripts/test_transactions.csv"
echo "Expected: Box 8 = AED -2,069.92 (Refundable)"
echo ""
