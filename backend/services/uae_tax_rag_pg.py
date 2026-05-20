"""
UAE Tax RAG service — Supabase pgvector backend.

Replaces the local ChromaDB implementation (rag/uae_tax_rag.py) for production.
Uses sentence-transformers (all-MiniLM-L6-v2, 384-dim) for embeddings and
Supabase RPC for similarity search.

Import never raises; every public method falls back gracefully on error so
classification always succeeds even when the RAG layer is unavailable.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class UAETaxRAG:
    """Retrieval-augmented generation service backed by Supabase pgvector."""

    def __init__(self) -> None:
        self._model = None
        self._sb = None
        self._ready = False
        # Load in background thread so uvicorn starts instantly
        import threading
        t = threading.Thread(target=self._load_safe, daemon=True)
        t.start()

    def _load_safe(self) -> None:
        try:
            self._load()
        except Exception as exc:  # noqa: BLE001
            logger.warning("UAETaxRAG init failed (RAG disabled): %s", exc)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Load the embedding model and Supabase client."""
        from sentence_transformers import SentenceTransformer  # type: ignore

        self._model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

        supabase_url = (
            os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
        ).strip()
        supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or ""
        ).strip()

        if not supabase_url or not supabase_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for RAG"
            )

        from supabase import create_client  # type: ignore

        self._sb = create_client(supabase_url, supabase_key)
        self._ready = True
        logger.info("UAETaxRAG ready (all-MiniLM-L6-v2, Supabase pgvector)")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def model(self):
        return self._model

    def embed(self, text: str) -> list[float]:
        """Return a 384-dimensional embedding for *text*.

        Falls back to a zero vector on any error so callers never crash.
        """
        try:
            if self._model is None:
                self._load()
            return self._model.encode(text).tolist()  # type: ignore[union-attr]
        except Exception as exc:  # noqa: BLE001
            logger.warning("UAETaxRAG.embed failed: %s", exc)
            return [0.0] * 384

    def retrieve(
        self,
        query: str,
        n_results: int = 8,
        law_type: Optional[str] = None,
    ) -> list[dict]:
        """Retrieve the top *n_results* chunks most similar to *query*.

        NEVER raises — returns [] on any error.
        """
        try:
            if not self._ready:
                return []
            embedding = self.embed(query)
            params: dict = {
                "query_embedding": embedding,
                "match_count": n_results,
                "filter_law_type": law_type,
            }
            response = self._sb.rpc("search_uae_tax_kb", params).execute()  # type: ignore[union-attr]
            return response.data or []
        except Exception as exc:  # noqa: BLE001
            logger.warning("UAETaxRAG.retrieve failed: %s", exc)
            return []

    def format_context(self, chunks: list[dict]) -> str:
        """Format retrieved chunks into a context string for the LLM."""
        if not chunks:
            return ""
        parts: list[str] = []
        for chunk in chunks:
            doc_name = chunk.get("doc_name", "Unknown")
            jurisdiction = chunk.get("jurisdiction", "")
            content = chunk.get("content", "")
            parts.append(f"[SOURCE: {doc_name} | {jurisdiction}]\n{content}\n---")
        return "\n".join(parts)

    def retrieve_and_format(
        self,
        query: str,
        law_type: Optional[str] = None,
    ) -> tuple[str, list[str]]:
        """Retrieve chunks and return (formatted_context, [doc_names used]).

        Always returns a 2-tuple; never raises.
        """
        try:
            chunks = self.retrieve(query, law_type=law_type)
            context = self.format_context(chunks)
            sources = list({c.get("doc_name", "") for c in chunks if c.get("doc_name")})
            return context, sources
        except Exception as exc:  # noqa: BLE001
            logger.warning("UAETaxRAG.retrieve_and_format failed: %s", exc)
            return "", []


# ---------------------------------------------------------------------------
# Module-level singleton — import never fails
# ---------------------------------------------------------------------------
try:
    uae_tax_rag = UAETaxRAG()
except Exception as _exc:  # noqa: BLE001
    logger.warning("UAETaxRAG singleton creation failed: %s", _exc)

    class _FallbackRAG:  # type: ignore[no-redef]
        """No-op fallback used when UAETaxRAG cannot initialise."""

        @property
        def model(self):
            return None

        def embed(self, text: str) -> list[float]:
            return [0.0] * 384

        def retrieve(self, query: str, n_results: int = 8, law_type: Optional[str] = None) -> list[dict]:
            return []

        def format_context(self, chunks: list[dict]) -> str:
            return ""

        def retrieve_and_format(self, query: str, law_type: Optional[str] = None) -> tuple[str, list[str]]:
            return "", []

    uae_tax_rag = _FallbackRAG()  # type: ignore[assignment]
