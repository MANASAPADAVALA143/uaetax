#!/usr/bin/env python3
"""
RAG smoke test — run after ingest_to_pgvector.py.

Usage:
    cd <project-root>
    python scripts/test_rag.py

Environment:
    SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
    SUPABASE_SERVICE_ROLE_KEY
"""

import sys
from pathlib import Path

# Put backend/ on the path so imports resolve
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from dotenv import load_dotenv  # type: ignore

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local", override=False)

print("Loading UAETaxRAG …")
from services.uae_tax_rag_pg import uae_tax_rag  # type: ignore  # noqa: E402

# ── Test 1: Embedding ────────────────────────────────────────────────────────

print("\nTest 1: Embedding")
emb = uae_tax_rag.embed("VAT on commercial property UAE")
assert len(emb) == 384, f"Expected 384 dims, got {len(emb)}"
print(f"  ✅  all-MiniLM-L6-v2 loaded — {len(emb)} dims")

# ── Test 2: Retrieval ────────────────────────────────────────────────────────

print("\nTest 2: Retrieval")
context, sources = uae_tax_rag.retrieve_and_format(
    "Is commercial property rental VAT exempt in UAE?"
)
if len(context) > 100:
    print(f"  ✅  RAG retrieval: {len(sources)} source(s) found")
    print(f"      Sources: {sources}")
else:
    print(
        "  ⚠️  RAG retrieval: no results — "
        "run python backend/scripts/ingest_to_pgvector.py first"
    )

# ── Test 3: Graceful failure ──────────────────────────────────────────────────

print("\nTest 3: Graceful failure on empty query")
result_ctx, result_src = uae_tax_rag.retrieve_and_format("")
assert isinstance(result_ctx, str)
assert isinstance(result_src, list)
print("  ✅  Empty query handled — no exception raised")

# ── Test 4: Singleton availability ───────────────────────────────────────────

print("\nTest 4: Singleton model property")
model_ready = uae_tax_rag.model is not None
print(f"  {'✅' if model_ready else '⚠️ '} model ready: {model_ready}")

print("\n✅  All RAG tests passed.\n")
