# UAE E-Invoicing Readiness Workflow — Setup Guide

## What this workflow does

Mirrors your `UAE_CT_Fixed.json` pattern but for e-invoicing readiness. Runs weekly (or on-demand), reads client data from Google Sheets, calculates readiness score against Ministerial Decisions 243 & 244 of 2025, generates a CFO-ready advisory with Claude, and pushes results to Sheets + Email + Slack + your GulfTax app.

## Import

1. Open n8n → Workflows → **Import from File**
2. Upload `n8n/workflows/UAE_EInvoicing_Readiness.json`
3. You will see 13 nodes connected

## Google Sheets setup (5 minutes)

Create one Google Sheet with **two tabs**:

### Tab 1: `E-Invoicing Intake` — headers (copy exactly)

```
Company Name | TRN Number | Annual Revenue AED | Fiscal Year End |
Entity Type | Business Type | Current Invoicing System |
Current Invoice Format | Invoices Per Month | ERP Upgrade Budget Confirmed |
ASP Appointed | ASP Name | Integration Status | Master Data Clean |
Has Intercompany Txns | Non-Resident Customers | CFO Email |
Tax Advisor Email | Slack Channel | Status
```

**Acceptable values:**

| Column | Values |
|--------|--------|
| Entity Type | `mainland` / `free_zone` / `designated_zone` / `government` |
| Business Type | `B2B` / `B2G` / `B2C` / `Mixed` |
| Current Invoice Format | `PDF` / `Paper` / `XML` / `UBL` / `JSON` / `Email` |
| ERP Upgrade Budget Confirmed | `YES` / `NO` |
| ASP Appointed | `YES` / `NO` |
| Integration Status | `not_started` / `in_progress` / `tested` / `live` |
| Master Data Clean | `YES` / `NO` / `PARTIAL` |
| Has Intercompany Txns | `YES` / `NO` |
| Non-Resident Customers | `YES` / `NO` |
| Status | `READY` (processes) / `DONE` (skip) |

### Tab 2: `E-Invoicing Tracker` — headers

```
Assessment Date | Company | TRN | Phase | Readiness Score | Urgency |
Critical Gaps | High Gaps | Days to ASP Deadline | Days to Go-Live |
Est Cost Low AED | Est Cost High AED | Penalty Exposure AED |
ASP Appointed | ASP Name | Status
```

## Configure nodes

### 1. Set Sheet IDs node

Open **Set Sheet IDs**, replace `YOUR_GOOGLE_SHEET_ID_HERE` with your sheet ID from the URL: `docs.google.com/spreadsheets/d/<THIS_PART>/`.

### 2. Google Sheets credentials

Both Sheets nodes share the same credential. Click either node → Credentials → Create new → OAuth2 → authorize.

### 3. Anthropic API key (Claude node)

- **Quick:** Open **Claude Advisory (Opus 4.7)**, replace `YOUR_ANTHROPIC_API_KEY` in the `x-api-key` header (or use Header Auth credential).

Model in the JSON body is **`claude-opus-4-7`**. Do not downgrade to `claude-opus-4-6` or legacy Sonnet IDs.

### 4. Gmail credential

Open **Email CFO + Tax Advisor** → Credentials → Create new → Gmail OAuth2 → authorize. Alternatively swap for SendGrid/SMTP.

### 5. Slack credential

Open **Slack Alert** → Credentials → Create new → Slack OAuth2 or Bot Token. Channel comes from the intake sheet per client.

### 6. (Optional) GulfTax app webhook

Relevant after you build Prompt 11 (automation bridge). Set in n8n:

```text
GULFTAX_API_URL=https://your-api-domain.com
GULFTAX_N8N_SECRET=any-long-random-string
```

The backend must validate the HMAC signature on inbound requests using the same secret. If the app is not running yet, **deactivate** the **GulfTax Webhook** node.

## Test with sample data

Add one row to the Intake tab (example):

- **Company Name:** Al Baraka Trading LLC  
- **TRN Number:** 100123456700003  
- **Annual Revenue AED:** 80000000  
- **Fiscal Year End:** 2026-12-31  
- **Entity Type:** mainland  
- **Business Type:** B2B  
- **Current Invoicing System:** SAP  
- **Current Invoice Format:** PDF  
- **Invoices Per Month:** 1200  
- **ERP Upgrade Budget Confirmed:** NO  
- **ASP Appointed:** NO  
- **ASP Name:** (empty)  
- **Integration Status:** not_started  
- **Master Data Clean:** PARTIAL  
- **Has Intercompany Txns:** YES  
- **Non-Resident Customers:** NO  
- **CFO Email:** your.test@email.com  
- **Tax Advisor Email:** (empty)  
- **Slack Channel:** #finance-compliance  
- **Status:** READY  

Expected engine output (approximate): Phase 1 (≥ AED 50M), low readiness score, RED urgency, cost band aligned with engine rules, days to ASP deadline and go-live computed from run date.

Click **Execute Workflow** manually. Check the Tracker tab, Gmail, and Slack.

## Schedule

Default cron: `0 8 * * 1` (Monday 08:00). Adjust in **Weekly Schedule** if needed.

## How it fits the GulfTax app

| n8n workflow | GulfTax app (Prompt 7) |
|--------------|-------------------------|
| Runs weekly on schedule | Runs on CFO click in app |
| Reads Google Sheet | Reads UI form / DB |
| Writes Tracker tab | Persists `EInvoicingAssessment` (planned) |
| Email / Slack | In-app + notifications |
| Webhook | `POST /api/automations/n8n/inbound/einvoicing_assessed` (planned) |

The **Calculate E-Invoicing Readiness** logic in the Code node is the natural port target for `POST /api/einvoicing/gap-assessment` in Python (same pattern as CT from `UAE_CT_Fixed.json`).

## Sales motion tip

Use this workflow as a **free lead magnet**: LinkedIn offer → call → fill Intake row → Execute Workflow → inbox delivery → upsell Growth tier (VAT + CT + calendar in one platform).
