# GulfTax AI Dashboard

Complete Next.js dashboard for UAE tax compliance management.

## Structure

```
frontend/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx          # Dashboard layout with sidebar
│   │   ├── page.tsx            # Main dashboard overview
│   │   ├── vat-classifier/     # Transaction classifier
│   │   ├── vat-return/         # VAT return generator
│   │   ├── reconciliation/     # Reconciliation bot
│   │   └── settings/           # Settings page
│   └── page.tsx                # Home page
└── components/
    ├── Sidebar.tsx             # Left navigation sidebar
    └── Header.tsx              # Top header with logo and company selector
```

## Pages

### 1. `/dashboard` - Main Overview
- **4 Stat Cards:**
  - VAT Due (AED)
  - Transactions Classified
  - Mismatches Found
  - Next Filing Deadline
- **Quick Action Buttons:**
  - Upload Transactions
  - Generate Return
  - Run Reconciliation
- **Recent Activity List:**
  - Shows latest classification, return generation, and reconciliation activities

### 2. `/dashboard/vat-classifier` - Transaction Classifier
- **File Upload Zone:**
  - Drag and drop CSV/Excel files
  - Click to browse
  - Upload button calls `POST /api/vat/classify-bulk`
- **Results Table:**
  - Columns: Date | Description | Amount AED | VAT Treatment | VAT Amount | Confidence | Flag | Actions
  - Color coding:
    - Green: Standard Rated
    - Blue: Zero Rated
    - Yellow: Exempt
    - Gray: Out of Scope
    - Red: Flagged for review
- **Features:**
  - Inline edit to override AI classification
  - Download classified Excel button
  - Real-time classification status

### 3. `/dashboard/vat-return` - VAT Return Generator
- **Period Selector:**
  - Quarter picker (Q1-Q4 2025)
  - Custom date range selection
- **Generate Return Button:**
  - Calls `POST /api/vat/generate-return`
- **FTA Boxes Display:**
  - All 8 boxes with AED amounts
  - Box 8 highlighted (VAT Payable/Refundable)
  - Color-coded: Red for payable, Green for refundable
- **Action Buttons:**
  - Download PDF
  - Download Excel
  - Submit to FTA (placeholder)

### 4. `/dashboard/reconciliation` - Recon Bot
- **VAT Return Selector:**
  - Dropdown to select return to reconcile
- **Run Reconciliation Button:**
  - Calls `POST /api/vat/reconcile/{vat_return_id}`
- **Results Display:**
  - Status: Matched ✅ or Mismatches Found ⚠️
  - Mismatch table with:
    - Invoice Number
    - Issue
    - Transaction Amount
    - Return Amount
    - Difference AED
  - AI recommendation text
  - Export mismatches to Excel button

## Components

### Sidebar
- Fixed left sidebar with navigation
- Active page highlighting
- Coming soon items greyed out
- Icons for each section

### Header
- GulfTax AI logo
- Company selector dropdown
- User avatar

## Design

- **Background:** Dark navy (#0d1b2e)
- **Cards:** #0A1A35 with border rgba(78,168,255,0.12)
- **Accents:** Gold gradient buttons (#C9A84C to #E8C96A)
- **Text:** White for headings, #7A9BB5 for muted text
- **Borders:** Blue tinted borders with hover effects

## API Integration

All pages integrate with the FastAPI backend:
- `POST /api/vat/classify-bulk` - Bulk transaction classification
- `POST /api/vat/generate-return` - Generate VAT return
- `GET /api/vat/returns/{id}/pdf` - Download PDF
- `GET /api/vat/returns/{id}/excel` - Download Excel
- `POST /api/vat/reconcile/{id}` - Run reconciliation

## Environment Variables

Set in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running

```bash
cd frontend
npm install
npm run dev
```

Dashboard will be available at `http://localhost:3000/dashboard`
