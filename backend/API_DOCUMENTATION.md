# VAT Classification API Documentation

## Endpoints

### POST `/api/vat/classify-transaction`

Classify a single transaction using RAG + Claude API.

**Request Body:**
```json
{
  "company_id": 1,
  "description": "Export of goods to Saudi Arabia",
  "amount_aed": 100000.0,
  "vendor_or_customer": "Saudi Trader Co.",
  "transaction_type": "sale",
  "entity_type": "mainland",
  "invoice_number": "INV-001",
  "transaction_date": "2025-01-15"
}
```

**Response:**
```json
{
  "vat_treatment": "zero_rated",
  "vat_rate": 0,
  "vat_amount_aed": 0.0,
  "confidence_score": 0.95,
  "reasoning": "Exports are zero-rated under UAE VAT Decree-Law No. 8 of 2017 Article 45.",
  "flag_for_review": false,
  "flag_reason": null
}
```

**Fields:**
- `company_id` (required): Company ID
- `description` (required): Transaction description
- `amount_aed` (required): Amount in AED (must be > 0)
- `vendor_or_customer` (optional): Vendor or customer name
- `transaction_type` (required): "sale" or "purchase"
- `entity_type` (required): "mainland", "free_zone", or "designated_zone"
- `invoice_number` (optional): Invoice number
- `transaction_date` (optional): Date in YYYY-MM-DD format

### POST `/api/vat/classify-bulk`

Classify multiple transactions from CSV/Excel file.

**Query Parameters:**
- `company_id` (required): Company ID
- `entity_type` (optional): "mainland", "free_zone", or "designated_zone" (default: "mainland")
- `transaction_type` (optional): "sale" or "purchase" (default: "sale")

**Request:**
- Multipart form data with file upload
- File must be CSV or Excel (.xlsx, .xls)
- Required columns: Description, Amount
- Optional columns: Vendor/Customer, Date, Invoice Number

**Response:**
```json
{
  "status": "success",
  "summary": {
    "total_transactions": 50,
    "total_amount_aed": 1250000.0,
    "total_vat_aed": 62500.0,
    "flagged_for_review": 2,
    "vat_breakdown": {
      "standard_rated": {
        "count": 30,
        "total_vat": 50000.0,
        "total_amount": 1000000.0
      },
      "zero_rated": {
        "count": 15,
        "total_vat": 0.0,
        "total_amount": 200000.0
      },
      "exempt": {
        "count": 3,
        "total_vat": 0.0,
        "total_amount": 35000.0
      },
      "out_of_scope": {
        "count": 2,
        "total_vat": 0.0,
        "total_amount": 15000.0
      },
      "reverse_charge": {
        "count": 0,
        "total_vat": 0.0,
        "total_amount": 0.0
      }
    }
  },
  "excel_file": "<downloadable Excel file>"
}
```

**Excel File:**
The response includes a downloadable Excel file with original data plus:
- VAT_Treatment
- VAT_Rate
- VAT_Amount_AED
- Confidence_Score
- Reasoning
- Flag_For_Review
- Flag_Reason

### GET `/api/vat/transactions/{company_id}`

Get all classified transactions for a company with optional filters.

**Path Parameters:**
- `company_id` (required): Company ID

**Query Parameters:**
- `period_start` (optional): Filter by start date (YYYY-MM-DD)
- `period_end` (optional): Filter by end date (YYYY-MM-DD)
- `vat_treatment` (optional): Filter by treatment (standard_rated, zero_rated, etc.)
- `flag_for_review` (optional): Filter by review flag (true/false)

**Response:**
```json
[
  {
    "id": 1,
    "company_id": 1,
    "date": "2025-01-15",
    "description": "Export of goods to Saudi Arabia",
    "amount_aed": 100000.0,
    "vendor_or_customer": "Saudi Trader Co.",
    "invoice_number": "INV-001",
    "vat_treatment": "zero_rated",
    "vat_amount_aed": 0.0,
    "confidence_score": 95.0,
    "ai_reasoning": "Exports are zero-rated...",
    "is_verified": false,
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

### PATCH `/api/vat/transactions/{transaction_id}/verify`

Allow user to override AI classification and mark as verified.

**Path Parameters:**
- `transaction_id` (required): Transaction ID

**Request Body:**
```json
{
  "vat_treatment": "zero_rated",
  "vat_amount_aed": 0.0,
  "verification_notes": "Verified by tax advisor - confirmed export transaction"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Transaction verified and updated",
  "transaction": {
    "id": 1,
    "company_id": 1,
    "date": "2025-01-15",
    "description": "Export of goods to Saudi Arabia",
    "amount_aed": 100000.0,
    "vendor_or_customer": "Saudi Trader Co.",
    "invoice_number": "INV-001",
    "vat_treatment": "zero_rated",
    "vat_amount_aed": 0.0,
    "confidence_score": 95.0,
    "ai_reasoning": "Original reasoning...\n\n[VERIFIED] Verified by tax advisor...",
    "is_verified": true,
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

## VAT Treatment Values

- `standard_rated` - 5% VAT
- `zero_rated` - 0% VAT
- `exempt` - 0% VAT (different from zero-rated)
- `out_of_scope` - No VAT applicable
- `reverse_charge` - 5% VAT (recipient liable)

## Error Responses

**400 Bad Request:**
```json
{
  "detail": "Company not found"
}
```

**404 Not Found:**
```json
{
  "detail": "Transaction not found"
}
```

**500 Internal Server Error:**
```json
{
  "detail": "Error processing file: <error message>"
}
```

## Example Usage

### cURL Examples

**Classify Single Transaction:**
```bash
curl -X POST "http://localhost:8000/api/vat/classify-transaction" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": 1,
    "description": "Export of goods to Saudi Arabia",
    "amount_aed": 100000.0,
    "vendor_or_customer": "Saudi Trader Co.",
    "transaction_type": "sale",
    "entity_type": "mainland"
  }'
```

**Bulk Classification:**
```bash
curl -X POST "http://localhost:8000/api/vat/classify-bulk?company_id=1&entity_type=mainland&transaction_type=sale" \
  -F "file=@transactions.csv"
```

**Get Transactions:**
```bash
curl "http://localhost:8000/api/vat/transactions/1?period_start=2025-01-01&period_end=2025-03-31&vat_treatment=zero_rated"
```

**Verify Transaction:**
```bash
curl -X PATCH "http://localhost:8000/api/vat/transactions/1/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "vat_treatment": "zero_rated",
    "vat_amount_aed": 0.0,
    "verification_notes": "Verified by tax advisor"
  }'
```

## Integration Notes

1. All transactions are automatically saved to the database
2. RAG system is used to find relevant UAE VAT rules
3. Claude API provides final classification with reasoning
4. Low confidence scores (< 0.7) are automatically flagged for review
5. Verified transactions cannot be automatically reclassified
