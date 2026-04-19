#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

echo "Starting GulfTax AI..."
echo ""

echo "Starting Backend (Port 8000)..."
cd "$ROOT/backend" || exit 1
if [ -d "venv" ]; then
  # shellcheck source=/dev/null
  source venv/bin/activate
  uvicorn main:app --reload --port 8000 &
  BACKEND_PID=$!
  echo "Backend started (PID: $BACKEND_PID)"
else
  echo "ERROR: Virtual environment not found. Please run: python -m venv venv"
  exit 1
fi

cd "$ROOT" || exit 1
sleep 3

echo "Starting Frontend (Port 3000)..."
npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "========================================"
echo "Servers starting..."
echo "========================================"
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "Dashboard: http://localhost:3000/dashboard"
echo ""
echo "Press Ctrl+C to stop all servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
