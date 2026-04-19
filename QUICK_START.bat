@echo off
REM GulfTax AI Quick Start Script for Windows
cd /d %~dp0

echo.
echo ========================================
echo GulfTax AI - Quick Start (Windows)
echo ========================================
echo.

REM Check if database exists
echo 1. Checking database...
psql -lqt 2>nul | findstr /C:"gulftax_ai" >nul
if %errorlevel% neq 0 (
    echo    Creating database...
    createdb gulftax_ai
    echo    [OK] Database created
) else (
    echo    [OK] Database exists
)

REM Backend setup
echo.
echo 2. Setting up backend...
cd backend

if not exist .env (
    echo    Creating .env from template...
    copy env_template.txt .env
    echo    [WARNING] Please edit backend\.env and add:
    echo       - ANTHROPIC_API_KEY=sk-ant-...
    echo       - DATABASE_URL=postgresql://user:password@localhost:5432/gulftax_ai
    pause
)

if not exist venv (
    echo    Creating virtual environment...
    python -m venv venv
)

echo    Activating virtual environment...
call venv\Scripts\activate.bat

echo    Installing dependencies...
pip install -q -r requirements.txt

echo    Running migrations...
alembic upgrade head

echo    [OK] Backend ready
cd ..

REM Frontend setup
echo.
echo 3. Setting up frontend (repo root)...

if not exist .env.local (
    echo    Creating .env.local...
    echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local
)

if not exist node_modules (
    echo    Installing dependencies...
    call npm install
)

echo    [OK] Frontend ready

REM Test data check
echo.
echo 4. Checking test data...
if exist "backend\scripts\test_transactions.csv" (
    echo    [OK] test_transactions.csv found
) else (
    echo    Generating test data...
    cd backend\scripts
    python generate_test_data.py
    cd ..\..
)

echo.
echo ========================================
echo [SUCCESS] Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Start backend:  cd backend ^&^& venv\Scripts\activate ^&^& uvicorn main:app --reload
echo 2. Start frontend: npm run dev  (from repo root)
echo 3. Open browser:   http://localhost:3000/dashboard
echo.
echo Test: Upload backend\scripts\test_transactions.csv
echo Expected: Box 8 = AED -2,069.92 (Refundable)
echo.
pause
