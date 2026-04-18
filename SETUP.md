# Quick Setup Guide

## 1. Install Dependencies

### Frontend
```bash
npm install
```

### Backend
```bash
cd backend
pip install -r requirements.txt
```

## 2. Configure Environment Variables

### Frontend
Create `.env.local` in project root:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend
Create `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Get your API key from: https://console.anthropic.com/

## 3. Start Servers

### Terminal 1 - Backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Terminal 2 - Frontend
```bash
npm run dev
```

## 4. Test the VAT Classifier

1. Open http://localhost:3000
2. Click "Open Dashboard →"
3. Navigate to "VAT Classifier" in sidebar
4. Upload `sample-transactions.csv`
5. Click "Classify Transactions"
6. View results!

## Troubleshooting

**Backend won't start:**
- Check Python version: `python --version` (need 3.9+)
- Verify `.env` file exists in `backend/` directory
- Check ANTHROPIC_API_KEY is set correctly

**Frontend can't connect to backend:**
- Verify backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Check browser console for CORS errors

**File upload fails:**
- Ensure file is CSV or Excel format
- Check file has "Description" and "Amount" columns
- Verify file size is reasonable (< 10MB)
