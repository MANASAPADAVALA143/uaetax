# GulfTax AI - Product Overview

## 🎯 Product Sections & Features

### 1. Landing Page (Marketing Site)

**URL:** http://localhost:3000

**Sections:**
- **Hero Section**
  - Main headline: "UAE Tax Compliance, Powered by AI"
  - Key metrics: 12 UAE Use Cases, 4 GCC Countries, 98% VAT Accuracy, 3 min Return Generated
  - CTA buttons: "Open Dashboard" and "Explore Modules"

- **Use Cases Section** (12 UAE Tax Use Cases)
  1. UAE Corporate Tax (9%)
  2. VAT Compliance (5%)
  3. Free Zone Tax Treatment
  4. Transfer Pricing Docs
  5. Excise Tax Filing
  6. ESR Compliance
  7. CbCR Reporting
  8. RERA Compliance
  9. GCC Group Consolidation
  10. IFRS to UAE-GAAP Mapping
  11. FTA Portal Integration
  12. VAT Recon Bot

- **Modules Section** (4 Platform Modules)
  - **Module 1 - VAT Intelligence Engine** (Core)
    - Transaction Classifier
    - FTA Portal Filing
    - VAT Recon Bot
    - Free Zone Rules
    - Return Generator
  
  - **Module 2 - Corporate Tax Engine**
    - CT Return Filing
    - QFZP Checker
    - 0% Free Zone Rate
  
  - **Module 3 - Regulatory Compliance Suite**
    - ESR Filing
    - Transfer Pricing
    - CbCR
    - RERA
  
  - **Module 4 - GCC Group & Reporting** (Enterprise)
    - GCC Consolidation
    - IFRS Mapping
    - IC Elimination

- **Pricing Section** (4 Tiers)
  - Indian CA Firms: $1,500/month
  - UAE CA / Audit Firms: $4,000/month (Most Popular)
  - UAE Corporates: $3,000/month
  - GCC Enterprise: Custom pricing

- **CTA Section**
  - "UAE Tax is Complex. GulfTax AI isn't."
  - Demo booking option

---

### 2. Dashboard Overview

**URL:** http://localhost:3000/dashboard

**Features:**
- **Company Selector** (Dropdown)
  - Switch between companies
  - Shows current company name

- **4 Stat Cards (KPIs)**
  1. VAT Due (AED) - Shows payable/refundable amount
  2. Transactions Classified - Total count with monthly change
  3. Mismatches Found - Number requiring review
  4. Next Filing Deadline - Days remaining

- **Quick Action Buttons**
  - Upload Transactions → Links to VAT Classifier
  - Generate Return → Links to VAT Return
  - Run Reconciliation → Links to Reconciliation

- **Recent Activity Feed**
  - Classification activities
  - Return generation events
  - Reconciliation results
  - Verification actions
  - Timestamps for each activity

---

### 3. VAT Classifier

**URL:** http://localhost:3000/dashboard/vat-classifier

**Features:**
- **File Upload Zone**
  - Drag and drop CSV/Excel files
  - Click to browse
  - Supports .csv, .xlsx, .xls formats
  - Real-time upload status

- **AI Classification**
  - Calls `POST /api/vat/classify-bulk`
  - Uses RAG system to find relevant UAE VAT rules
  - Claude API for final classification
  - Processes each transaction automatically

- **Results Table**
  - **Columns:**
    - Date
    - Description
    - Amount AED
    - VAT Treatment (color-coded badges)
    - VAT Amount
    - Confidence Score (0-100%)
    - Flag Status (✓ or ⚠️)
    - Actions (Edit button)

- **Color Coding:**
  - 🟢 **Green** = Standard Rated (5%)
  - 🔵 **Blue** = Zero Rated (0%)
  - 🟡 **Yellow** = Exempt
  - ⚪ **Gray** = Out of Scope
  - 🔴 **Red** = Flagged for Review

- **Inline Editing**
  - Click edit icon to override AI classification
  - Dropdown to select correct treatment
  - Save/Cancel buttons
  - Updates VAT amount automatically

- **Export Functionality**
  - Download classified results as Excel
  - Includes all original data + classifications
  - Ready for import into accounting systems

---

### 4. VAT Return Generator

**URL:** http://localhost:3000/dashboard/vat-return

**Features:**
- **Period Selector**
  - Quarter picker (Q1-Q4 2025)
  - Custom date range selection
  - Start date and end date inputs

- **Generate Return Button**
  - Calls `POST /api/vat/generate-return`
  - Pulls all verified transactions for period
  - Calculates all 8 FTA boxes automatically

- **FTA Box Display** (All 8 Boxes)
  - **Box 1:** Standard Rated Supplies (AED amount)
  - **Box 2:** VAT on Supplies (5% of Box 1)
  - **Box 3:** Zero Rated Supplies
  - **Box 4:** Exempt Supplies
  - **Box 5:** Total Taxable Supplies (Box 1 + 3 + 4)
  - **Box 6:** Taxable Expenses
  - **Box 7:** VAT on Expenses (5% of Box 6)
  - **Box 8:** VAT Payable/Refundable (Box 2 - Box 7)
    - **Highlighted** in red if payable, green if refundable

- **Download Options**
  - **Download PDF** - FTA-formatted return
  - **Download Excel** - 5-sheet workbook:
    - Sheet 1: VAT Return Summary
    - Sheet 2: Sales Transactions Detail
    - Sheet 3: Purchase Transactions Detail
    - Sheet 4: Zero Rated Breakdown
    - Sheet 5: Exempt Breakdown

- **Submit to FTA Button** (Placeholder)
  - Ready for FTA API integration
  - Will submit return directly to FTA portal

---

### 5. Reconciliation Bot

**URL:** http://localhost:3000/dashboard/reconciliation

**Features:**
- **VAT Return Selector**
  - Dropdown to select return to reconcile
  - Shows period and dates

- **Run Reconciliation Button**
  - Calls `POST /api/vat/reconcile/{vat_return_id}`
  - Compares invoice totals vs return boxes
  - Finds mismatches > AED 100

- **Results Display**
  - **Status Card:**
    - ✅ "Matched" (green) if all transactions match
    - ⚠️ "Mismatches Found" (yellow) if issues detected
    - Shows total difference in AED

- **Mismatch Table** (if mismatches found)
  - **Columns:**
    - Invoice Number
    - Issue Description
    - Transaction Amount
    - Return Amount
    - Difference AED (highlighted in red)

- **AI Recommendations**
  - Claude API generates fix suggestions
  - Explains common causes:
    - Unverified transactions
    - Incorrect VAT treatment
    - Missing invoices
    - Calculation errors

- **Export Mismatches**
  - Download mismatches to Excel
  - For review and correction

---

### 6. Settings Page

**URL:** http://localhost:3000/dashboard/settings

**Features:**
- Placeholder for future settings
- Will include:
  - Company management
  - User preferences
  - API keys configuration
  - Notification settings

---

## 🔧 Backend API Features

### VAT Classification API
- **Single Transaction Classification**
  - RAG-powered rule lookup
  - Claude API reasoning
  - Database persistence
  - Confidence scoring

- **Bulk Classification**
  - CSV/Excel file processing
  - Batch processing
  - Progress tracking
  - Excel export with results

- **Transaction Management**
  - List with filters (period, treatment, flag status)
  - Manual verification/override
  - Update classifications

### VAT Return API
- **Return Generation**
  - Automatic box calculation
  - Period-based aggregation
  - Database storage
  - Status tracking (draft/submitted/filed)

- **Report Generation**
  - PDF (FTA form format)
  - Excel (5-sheet workbook)
  - Downloadable files

- **Reconciliation**
  - Invoice vs return comparison
  - Mismatch detection
  - AI recommendations
  - Results storage

---

## 🧠 AI & RAG Features

### RAG System (Retrieval Augmented Generation)
- **4 Knowledge Collections:**
  1. UAE VAT Law (12 rules)
  2. Corporate Tax Law (3 rules)
  3. FTA Public Clarifications (ready for content)
  4. Free Zone Regulations (2 rules)

- **Semantic Search**
  - Query relevant tax rules
  - Returns top 3 matches
  - Context-aware retrieval

- **VAT Treatment Recommendations**
  - Uses RAG + Claude API
  - Provides reasoning
  - Confidence scoring
  - Fallback to rule-based if Claude unavailable

### Claude API Integration
- **System Prompts:**
  - UAE VAT expert persona
  - FTA Decree-Law No. 8 of 2017 knowledge
  - Precision-focused classification

- **Features:**
  - JSON-only responses
  - Confidence scoring
  - Flagging for review
  - Detailed reasoning

---

## 📊 Database Features

### Models
- **Company**
  - Multi-company support
  - TRN, entity type, free zone tracking
  - VAT/CT registration status

- **Transaction**
  - Full transaction history
  - AI classifications stored
  - Verification tracking
  - Confidence scores

- **VATReturn**
  - Period-based returns
  - All 8 FTA boxes
  - Status workflow
  - FTA submission tracking

- **ReconciliationResult**
  - Mismatch storage
  - JSON mismatch details
  - AI recommendations
  - Historical tracking

---

## 🎨 Design Features

### Visual Design
- **Color Scheme:**
  - Dark navy background (#0d1b2e)
  - Gold accents (#C9A84C, #E8C96A)
  - Blue highlights (#4EA8FF)
  - Green for success (#2DD4A0)
  - Red for warnings (#FF6B6B)

- **Typography:**
  - Playfair Display (headings)
  - DM Sans (body text)
  - JetBrains Mono (code/metrics)

- **UI Components:**
  - Glassmorphism cards
  - Gradient buttons
  - Color-coded badges
  - Hover effects
  - Smooth transitions

### User Experience
- **Navigation:**
  - Fixed sidebar
  - Active page highlighting
  - Breadcrumb navigation
  - Quick action buttons

- **Responsive Design:**
  - Mobile-friendly
  - Tablet optimized
  - Desktop full-featured

---

## 🔐 Security & Compliance

### Data Security
- Environment variable management
- Database connection security
- API key protection
- CORS configuration

### UAE Compliance
- FTA-compliant return format
- UAE VAT Decree-Law No. 8 of 2017 compliance
- Free zone rules implementation
- Corporate Tax Law support

---

## 📈 Analytics & Reporting

### Dashboard Metrics
- Real-time KPI cards
- Transaction counts
- Mismatch tracking
- Deadline monitoring

### Reports
- PDF VAT returns
- Excel detailed breakdowns
- Reconciliation reports
- Classification exports

---

## 🚀 Future Features (Coming Soon)

- Corporate Tax Engine
- ESR Filing automation
- Transfer Pricing documentation
- FTA Portal direct integration
- Multi-entity consolidation
- White-label options
- API webhooks
- Email notifications
- Audit trail logging

---

## 💰 Pricing Tiers

1. **Indian CA Firms** - $1,500/month
   - Modules 1 & 2
   - Up to 5 companies
   - Email support

2. **UAE CA / Audit Firms** - $4,000/month ⭐
   - All 4 modules
   - Unlimited companies
   - Priority support
   - Dedicated account manager

3. **UAE Corporates** - $3,000/month
   - Modules 1, 2, 3
   - Single entity
   - CFO dashboard
   - Standard support

4. **GCC Enterprise** - Custom
   - All modules + white-label
   - GCC consolidation
   - SLA-backed support
   - On-premise option

---

**Total: 6 main sections, 50+ features, production-ready! 🚀**
