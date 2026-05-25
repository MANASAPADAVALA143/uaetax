# UAE Law PDFs — Knowledge Base

Place UAE tax law PDF files in this folder before running the RAG ingestion script.

## Suggested files to add:
- UAE VAT Federal Decree-Law No. 8 of 2017
- UAE Corporate Tax Law (Federal Decree-Law No. 47 of 2022)
- FTA VAT Public Clarifications
- UAE E-Invoicing regulations

## To ingest after adding PDFs:
```bash
cd uaetax
pip install -r backend/requirements.txt
python backend/scripts/ingest_to_pgvector.py
```

If you skip this, RAG falls back to Claude's built-in knowledge automatically.
