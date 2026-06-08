@echo off
cd /d "%~dp0"
set PYTHONUNBUFFERED=1
echo Starting GulfTax API on http://127.0.0.1:8000 ...
echo Wait for: Application startup complete
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
