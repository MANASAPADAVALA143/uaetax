@echo off
echo Starting GulfTax AI...
echo.

echo Starting Backend (Port 8000)...
start "GulfTax Backend" cmd /k "cd backend && if exist venv\Scripts\activate.bat (venv\Scripts\activate && uvicorn main:app --reload --port 8000) else (echo Please create virtual environment first: python -m venv venv && pause)"

timeout /t 3 /nobreak >nul

echo Starting Frontend (Port 3000)...
start "GulfTax Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================
echo Servers starting...
echo ========================================
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo Dashboard: http://localhost:3000/dashboard
echo.
echo Press any key to exit...
pause >nul
