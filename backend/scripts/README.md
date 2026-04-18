# Test Data Generator Scripts

## generate_test_data.py

Generates realistic UAE business test data for GulfTax AI testing.

### Usage

```bash
cd backend/scripts
python generate_test_data.py
```

### Output Files

1. **test_transactions.csv** - Mainland company transactions
   - Company: Al Baraka Trading LLC
   - Entity Type: Mainland
   - TRN: 100123456700003
   - 50 transactions for Q1 2025

2. **test_transactions_freezone.csv** - Free zone company transactions
   - Company: Dubai Digital FZE
   - Entity Type: Free Zone (DMCC)
   - 30 transactions showing free zone complexity

### Transaction Mix

#### Mainland Company (50 transactions):
- 15 standard-rated sales (5% VAT)
- 8 zero-rated sales (exports, international transport)
- 5 exempt sales (bare land, local transport)
- 10 standard-rated purchases
- 5 reverse charge (international subscriptions)
- 7 out of scope (salaries, dividends)

#### Free Zone Company (30 transactions):
- Mainland to free zone supplies (zero-rated)
- Free zone to free zone (same zone - out of scope)
- Free zone to free zone (different zones - standard rated)
- Free zone to mainland (standard rated)
- Exports (zero-rated)
- Standard rated purchases
- Reverse charge (international)
- Out of scope (salaries, dividends)

### CSV Format

```csv
date,description,vendor_or_customer,invoice_number,amount_aed,vat_treatment,vat_amount_aed,transaction_type
2025-01-15,Office furniture supply,Al Futtaim LLC,INV-20250115-1234,52500.00,standard_rated,2625.00,sale
```

### Expected Results

The script prints a summary showing:
- Total transactions
- VAT breakdown by treatment
- All 8 FTA VAT return boxes
- Box 8 value (VAT payable/refundable)

### Testing Workflow

1. Run the script to generate CSV files
2. Upload `test_transactions.csv` to VAT Classifier
3. Verify classifications match expected treatments
4. Generate VAT return for Q1 2025
5. Run reconciliation to check for mismatches
6. Test free zone scenarios with `test_transactions_freezone.csv`

### Notes

- Amounts range from AED 500 to AED 250,000
- Dates are randomly distributed within Q1 2025
- Invoice numbers follow format: INV-YYYYMMDD-XXXX
- All transactions include realistic UAE vendor/customer names
- Free zone transactions demonstrate designated zone rules
