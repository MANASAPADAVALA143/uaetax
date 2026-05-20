#!/bin/bash
# GulfTax AI Backend startup script
# Runs Alembic migrations then starts uvicorn with clear error logging

set -e  # Exit on any error

echo "======================================"
echo " GulfTax AI Backend Starting Up"
echo " Port: ${PORT:-8000}"
echo " Date: $(date -u)"
echo "======================================"

# Verify required env vars
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set!"
  exit 1
fi

echo "[1/3] Running Alembic migrations..."
alembic upgrade head
echo "[2/3] Migrations complete."

echo "[3/3] Starting uvicorn on 0.0.0.0:${PORT:-8000} ..."
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1 \
  --log-level info
