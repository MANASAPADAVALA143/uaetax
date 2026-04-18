# GulfTax AI Backend

FastAPI backend for VAT transaction classification using Claude API.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Running

```bash
uvicorn main:app --reload --port 8000
```

Or from project root:
```bash
npm run backend
```

## API Endpoints

### POST `/api/vat/classify`
Upload CSV/Excel file with transactions. Returns classifications.

**Expected file format:**
- Description column (required)
- Vendor/Supplier column (optional)
- Amount column (required)

**Response:**
```json
{
  "status": "success",
  "count": 10,
  "classifications": [
    {
      "description": "Office furniture supply",
      "vendor": "Al Futtaim LLC",
      "amount": "52500",
      "vat_treatment": "Standard Rated (5%)",
      "confidence": 99,
      "reasoning": "Office furniture is standard rated in UAE mainland"
    }
  ]
}
```

### POST `/api/vat/classify-single`
Classify a single transaction.

**Request:**
```json
{
  "description": "Office furniture supply",
  "vendor": "Al Futtaim LLC",
  "amount": "52500"
}
```
