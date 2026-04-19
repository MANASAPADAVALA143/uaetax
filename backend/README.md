# GulfTax AI Backend

FastAPI backend for VAT transaction classification using Claude API.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create `.env` file:
```bash
cp env.example .env
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

See `API_DOCUMENTATION.md` for full detail. Summary:

### POST `/api/vat/classify-transaction`

Classify one transaction (JSON body, persists to DB).

### POST `/api/vat/classify-bulk`

Upload CSV/Excel (`multipart/form-data` + query `company_id`, optional `entity_type`, `transaction_type`). Returns `summary.classifications` with `vat_treatment` as snake_case (e.g. `standard_rated`, `reverse_charge`).

**Example classification row:**

```json
{
  "description": "Office furniture supply",
  "vendor_or_customer": "Al Futtaim LLC",
  "amount_aed": 52500,
  "vat_treatment": "standard_rated",
  "confidence": 0.99,
  "reasoning": "Office furniture is standard rated in UAE mainland"
}
```
