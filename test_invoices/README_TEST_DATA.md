# GulfTax AI — Test Data Pack (LinkedIn Demo Ready)

## Invoice Flow Test Invoices
Open each HTML file in Chrome → Print → Save as PDF → upload to Invoice Flow

| File | Vendor | Amount | Expected Score | Expected Result |
|------|--------|--------|----------------|-----------------|
| `01_LOW_RISK_Etisalat_Telecom.html` | e& (Etisalat) | AED 10,290 | ~12/100 CLEAR | ✅ Auto-approved → VAT Classifier instantly |
| `02_LOW_RISK_Emaar_Facilities.html` | Emaar FM | AED 42,000 | ~18/100 CLEAR | ✅ Auto-approved → VAT Classifier instantly |
| `03_MEDIUM_RISK_Pinnacle_Consulting.html` | Pinnacle DMCC | AED 52,332 | ~44/100 MEDIUM | ⏳ → AP Review Queue (new vendor, no PO) |
| `04_MEDIUM_RISK_Desert_Rose_Catering.html` | Desert Rose Catering | AED 22,522 | ~51/100 MEDIUM | ⏳ → AP Review Queue (entertainment VAT risk) |
| `05_HIGH_RISK_AlFajr_Trading_URGENT.html` | Al Fajr Trading | AED 78,750 | ~87/100 HIGH | 🚨 Hard Blocked (no TRN + duplicate + urgency) |
| `06_HIGH_RISK_Luxury_Events_Gala.html` | Opulent Events | AED 134,750 | ~79/100 HIGH | 🚨 Hard Blocked (no TRN + entertainment + verbal approval) |

## Demo Script (LinkedIn / Client Walkthrough)

1. **Upload Invoice 01 (Etisalat)** → Watch it auto-appear in VAT Classifier under "📄 Invoice · Auto" in seconds
2. **Upload Invoice 02 (Emaar)** → Same auto-flow. Show Box 6/7 updating immediately
3. **Upload Invoice 03 (Pinnacle)** → Show it land in AP Review Queue with flags. Click Approve → moves to VAT Classifier
4. **Upload Invoice 04 (Desert Rose)** → Show entertainment flag, reviewer decides whether to approve
5. **Upload Invoice 05 (Al Fajr)** → Show HARD BLOCK. Only Finance Manager can override with reason
6. **Upload Invoice 06 (Opulent Events)** → Show HARD BLOCK. Point out unregistered TRN = illegal VAT

## VAT Classifier CSV Test Data
Upload `sample_transactions_Q2_2025_30rows.csv` to VAT Classifier

- **30 realistic UAE corporate transactions** spanning April–June 2025
- Mix of: standard-rated, zero-rated (exports, flights, insurance), exempt (rent)
- Companies: KPMG, McKinsey, SAP, PwC, Deloitte, Microsoft, Emirates, DHL
- Includes 1 export sale (zero-rated) for Box 3
- After upload → go to **VAT Return → Q2 2025 → Generate Return** to see all 8 boxes populated

## Key Tax Scenarios in the CSV

| Transaction | VAT Treatment | Why |
|-------------|--------------|-----|
| DIFC Office Rent | Exempt (0%) | Commercial property lease |
| AXA Insurance | Exempt (0%) | Insurance is exempt supply |
| DHL Air Freight | Zero-rated (0%) | International freight |
| Emirates Flights | Zero-rated (0%) | International passenger transport |
| Chubb Insurance | Exempt (0%) | Insurance premium |
| Saudi Export Sale | Zero-rated (0%) | Export of goods |
| Everything else | Standard 5% | Standard-rated B2B services |
