# GulfTax AI — n8n Workflows

## Required environment variables in n8n

Set these in **n8n → Settings → Environment Variables**:

| Variable | Value | Example |
|---|---|---|
| `GULFTAX_BACKEND_URL` | Render backend URL (no trailing slash) | `https://uaetax-api.onrender.com` |
| `ANTHROPIC_API_KEY` | Your Anthropic key | `sk-ant-...` |
| `N8N_WEBHOOK_SECRET` | HMAC secret shared with backend | any strong random string |

> **Important:** All HTTP Request nodes use `={{ $env.GULFTAX_BACKEND_URL }}/api/...`  
> Never hardcode IP addresses or `localhost`. Update `GULFTAX_BACKEND_URL` whenever your Render URL changes.

---

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `UAE_VAT_Return_Prep.json` | Quarterly CRON | Pulls transactions, runs Claude AI assessment, POSTs result to `/api/vat/n8n/inbound/vat_assessed` |
| `UAE_EInvoicing_Readiness.json` | Manual / scheduled | Runs e-invoicing gap assessment, POSTs to `/api/automations/n8n/inbound/einvoicing_assessed` |
| `Prompt1_UAE_EInvoicing_Readiness_Assessment.json` | Manual | Full e-invoicing readiness assessment with Claude |
| `Prompt2_UAE_Corporate_Tax_Auto_Calculate.json` | Scheduled | Auto-calculates corporate tax and updates CT return |
| `Prompt3_EInvoicing_Manual_Trigger_Handler.json` | Webhook | Handles manual e-invoicing trigger requests from the dashboard |

---

## How to import

1. **n8n → Workflows → Import from file**
2. Import each `.json` file from the `workflows/` directory
3. Set `GULFTAX_BACKEND_URL` in **n8n Settings → Variables**
4. Set `N8N_WEBHOOK_SECRET` (same value as in backend `.env`)
5. Activate each workflow

---

## Inbound webhooks (n8n → GulfTax backend)

These routes are **intentionally unauthenticated** via Bearer token — n8n uses HMAC-SHA256 signature verification (`X-N8N-Signature` header) instead:

| Route | Called by |
|---|---|
| `POST /api/vat/n8n/inbound/vat_assessed` | `UAE_VAT_Return_Prep` workflow |
| `POST /api/automations/n8n/inbound/einvoicing_assessed` | EInvoicing workflows |
| `POST /api/automations/n8n/inbound/gl_imported` | GL import workflow |

---

## Verifying your setup

After deploying to Render, check the health endpoint:

```
curl https://your-render-url.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "backend_url": "https://your-render-url.onrender.com",
  "rag_available": true,
  "db_connected": true,
  "timestamp": "2026-05-17T..."
}
```

`rag_available: true` confirms sentence-transformers loaded and Supabase pgvector is reachable.  
Run `python backend/scripts/ingest_to_pgvector.py` first to populate the knowledge base.
