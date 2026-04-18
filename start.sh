#!/bin/bash

echo "Starting GulfTax AI..."
echo ""

# Start Backend
echo "Starting Backend (Port 8000)..."
cd backend
if [ -d "venv" ]; then
    source venv/bin/activate
    uvicorn main:app --reload --port 8000 &
    BACKEND_PID=$!
    echo "Backend started (PID: $BACKEND_PID)"
else
    echo "ERROR: Virtual environment not found. Please run: python -m venv venv"
    exit 1
fi

cd ..

# Wait a moment
sleep 3

# Start Frontend
echo "Starting Frontend (Port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

cd ..

echo ""
echo "========================================"
echo "Servers starting..."
echo "========================================"
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "Dashboard: http://localhost:3000/dashboard"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
