# VAT Return Generator API Documentation

## Endpoints

### POST `/api/vat/generate-return`

Generate VAT return for a company and period.

**Request Body:**
```json
{
  "company_id": 1,
  "period_start": "2025-01-01",
  "period_end": "2025-03-31"
}
```

**Response:**
```json
{
  "return_id": 1,
  "company_id": 1,
  "period_start": "2025-01-01",
  "period_end": "2025-03-31",
  "box1_standard_rated_supplies": 842500.0,
  "box2_vat_on_supplies": 42125.0,
  "box3_zero_rated_supplies": 420000.0,
  "box4_exempt_supplies": 35000.0,
  "box5_total_taxable_supplies": 1297500.0,
  "box6_taxable_expenses": 155400.0,
  "box7_vat_on_expenses": 7770.0,
  "box8_vat_payable_or_refundable": 42180.0,
  "status": "draft",
  "created_at": "2025-01-15T10:30:00Z",
  "pdf_url": "/api/vat/returns/1/pdf",
  "excel_url": "/api/vat/returns/1/excel"
}
```

**Logic:**
1. Pulls all verified transactions for the period
2. Calculates all 8 FTA return boxes:
   - Box 1: Sum of standard-rated supplies (sales)
   - Box 2: 5% of Box 1 (output VAT)
   - Box 3: Sum of zero-rated supplies
   - Box 4: Sum of exempt supplies
   - Box 5: Box 1 + Box 3 + Box 4
   - Box 6: Sum of taxable purchases (standard-rated)
   - Box 7: 5% of Box 6 (input VAT recoverable)
   - Box 8: Box 2 minus Box 7 (VAT payable/refundable)
3. Saves to VATReturn table
4. Generates PDF report (FTA form format)
5. Generates Excel with 5 sheets

**Excel Sheets:**
- Sheet 1: VAT Return Summary (all 8 boxes)
- Sheet 2: Sales Transactions Detail
- Sheet 3: Purchase Transactions Detail
- Sheet 4: Zero-rated breakdown
- Sheet 5: Exempt breakdown

### GET `/api/vat/returns/{return_id}/pdf`

Download VAT return PDF report.

**Response:** PDF file download

### GET `/api/vat/returns/{return_id}/excel`

Download VAT return Excel report.

**Response:** Excel file download

### POST `/api/vat/reconcile/{vat_return_id}`

Reconcile VAT return with invoice transactions.

**Response:**
```json
{
  "status": "mismatch_found",
  "difference_aed": 1250.0,
  "mismatches": [
    {
      "invoice_number": "INV-001",
      "issue": "VAT treatment mismatch or amount difference",
      "transaction_amount": 52500.0,
      "return_amount": 2625.0,
      "difference": 125.0
    },
    {
      "invoice_number": "Box 1",
      "issue": "Standard rated supplies amount mismatch",
      "transaction_amount": 850000.0,
      "return_amount": 842500.0,
      "difference": 7500.0
    }
  ],
  "recommendation": "Review the mismatches. The standard rated supplies difference suggests some transactions may not be verified or have incorrect VAT treatment. Verify all transactions with invoice numbers INV-001 through INV-010 and ensure they are correctly classified."
}
```

**Logic:**
1. Sums all invoice amounts by treatment
2. Compares against VAT return boxes
3. Finds mismatches > AED 100
4. Checks individual transactions for VAT amount discrepancies
5. Saves ReconciliationResult to database
6. Generates AI recommendation using Claude API

**Mismatch Detection:**
- Box-level mismatches: Compares invoice totals by treatment against return boxes
- Transaction-level mismatches: Checks if individual transaction VAT amounts match expected values
- Threshold: Only reports mismatches > AED 100

## Box Calculation Details

### Sales Transactions (Boxes 1-5)
- **Box 1**: Standard-rated supplies (sales with 5% VAT)
- **Box 2**: Output VAT = Box 1 × 5%
- **Box 3**: Zero-rated supplies (sales with 0% VAT)
- **Box 4**: Exempt supplies (sales exempt from VAT)
- **Box 5**: Total = Box 1 + Box 3 + Box 4

### Purchase Transactions (Boxes 6-8)
- **Box 6**: Taxable expenses (purchases with standard-rated treatment)
- **Box 7**: Input VAT recoverable = Box 6 × 5%
- **Box 8**: Net VAT = Box 2 - Box 7
  - Positive: VAT payable to FTA
  - Negative: VAT refundable from FTA

## Example Usage

### Generate VAT Return

```bash
curl -X POST "http://localhost:8000/api/vat/generate-return" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": 1,
    "period_start": "2025-01-01",
    "period_end": "2025-03-31"
  }'
```

### Download PDF

```bash
curl "http://localhost:8000/api/vat/returns/1/pdf" --output vat_return.pdf
```

### Download Excel

```bash
curl "http://localhost:8000/api/vat/returns/1/excel" --output vat_return.xlsx
```

### Reconcile Return

```bash
curl -X POST "http://localhost:8000/api/vat/reconcile/1"
```

## Notes

- Only **verified transactions** are included in VAT return calculations
- Transactions must be marked as `is_verified = true` to be included
- PDF report is formatted to match FTA VAT return form style
- Excel report includes detailed transaction breakdowns
- Reconciliation compares invoice totals against return boxes
- AI recommendations are generated using Claude API for mismatch resolution
