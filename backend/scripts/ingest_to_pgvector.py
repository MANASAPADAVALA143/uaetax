#!/usr/bin/env python3
"""
Ingest UAE law PDFs into Supabase pgvector.

Usage:
    cd backend
    python scripts/ingest_to_pgvector.py

Environment:
    SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
    SUPABASE_SERVICE_ROLE_KEY

PDFs should be placed in: knowledge_base/uae_law/
(relative to the project root, i.e. one level above backend/)
"""

import os
import sys
from pathlib import Path

# Allow running from backend/ or project root
_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here.parent))          # backend/
sys.path.insert(0, str(_here.parent.parent))   # project root

UAE_LAW_SOURCES = {
    "DIFC_Contract_Law.pdf": {
        "jurisdiction": "DIFC",
        "law_type": "Contract",
        "doc_name": "DIFC Contract Law No.6 2004",
        "source_url": "https://www.difc.com",
    },
    "DIFC_Employment_Law.pdf": {
        "jurisdiction": "DIFC",
        "law_type": "Employment",
        "doc_name": "DIFC Employment Law No.2 2019",
        "source_url": "https://www.difc.com",
    },
    "DIFC_Court_Rules.pdf": {
        "jurisdiction": "DIFC",
        "law_type": "Procedural",
        "doc_name": "DIFC Court Rules",
        "source_url": "https://www.difc.com",
    },
    "ADGM_Employment_Regulations.pdf": {
        "jurisdiction": "ADGM",
        "law_type": "Employment",
        "doc_name": "ADGM Employment Regulations 2019",
        "source_url": "https://www.adgm.com",
    },
    "ADGM_Companies_Regulations.pdf": {
        "jurisdiction": "ADGM",
        "law_type": "Commercial",
        "doc_name": "ADGM Companies Regulations 2020",
        "source_url": "https://www.adgm.com",
    },
    "UAE_Commercial_Companies_Law.pdf": {
        "jurisdiction": "UAE_Federal",
        "law_type": "Commercial",
        "doc_name": "UAE Commercial Companies Law",
        "source_url": "https://uaelegislation.gov.ae",
    },
    "UAE_VAT_Law.pdf": {
        "jurisdiction": "UAE_Federal",
        "law_type": "VAT",
        "doc_name": "UAE Federal Decree-Law No.8 2017 VAT",
        "source_url": "https://uaelegislation.gov.ae",
    },
    "UAE_Corporate_Tax_Law.pdf": {
        "jurisdiction": "UAE_Federal",
        "law_type": "Corporate_Tax",
        "doc_name": "UAE Federal Decree-Law No.47 2022 CT",
        "source_url": "https://uaelegislation.gov.ae",
    },
}


def chunk_text(text: str, size: int = 800, overlap: int = 150) -> list[str]:
    """Split text into overlapping word-based chunks."""
    words = text.split()
    chunks: list[str] = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + size])
        if chunk.strip():
            chunks.append(chunk)
        i += size - overlap
    return chunks


def ingest_pdf(pdf_path: str, metadata: dict, model, sb_client) -> int:
    """Extract, embed, and insert a single PDF's chunks. Returns chunk count."""
    import pdfplumber  # type: ignore

    all_chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_chunks.extend(chunk_text(text))

    if not all_chunks:
        print(f"⚠️  {metadata['doc_name']}: no text extracted")
        return 0

    rows = []
    for idx, chunk in enumerate(all_chunks):
        embedding = model.encode(chunk).tolist()
        rows.append(
            {
                "content": chunk,
                "embedding": embedding,
                "jurisdiction": metadata["jurisdiction"],
                "law_type": metadata["law_type"],
                "doc_name": metadata["doc_name"],
                "source_url": metadata.get("source_url"),
                "chunk_index": idx,
            }
        )

    # Batch insert to stay within Supabase request limits
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        sb_client.table("uae_tax_kb").insert(rows[i : i + batch_size]).execute()

    print(f"✅  {metadata['doc_name']}: {len(rows)} chunks ingested")
    return len(rows)


def main() -> None:
    from dotenv import load_dotenv  # type: ignore

    # Load .env from backend/ first, then project root
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local", override=False)

    supabase_url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).strip()
    supabase_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)

    from supabase import create_client  # type: ignore
    from sentence_transformers import SentenceTransformer  # type: ignore

    print("Loading sentence-transformers/all-MiniLM-L6-v2 …")
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    sb = create_client(supabase_url, supabase_key)

    # PDFs live at <project_root>/knowledge_base/uae_law/
    project_root = Path(__file__).resolve().parent.parent.parent
    pdf_dir = project_root / "knowledge_base" / "uae_law"

    total = 0
    for filename, meta in UAE_LAW_SOURCES.items():
        pdf_path = pdf_dir / filename
        if not pdf_path.exists():
            print(f"⚠️  Skipping {filename} — not found at {pdf_path}")
            continue
        total += ingest_pdf(str(pdf_path), meta, model, sb)

    print(f"\n✅  Total: {total} chunks ingested into Supabase pgvector")


if __name__ == "__main__":
    main()
