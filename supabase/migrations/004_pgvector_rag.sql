-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- UAE tax law knowledge base
CREATE TABLE uae_tax_kb (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  embedding   vector(384),        -- all-MiniLM-L6-v2 dims
  jurisdiction TEXT NOT NULL,     -- UAE_Federal, DIFC, ADGM
  law_type    TEXT NOT NULL,      -- VAT, Corporate_Tax, etc
  doc_name    TEXT NOT NULL,
  source_url  TEXT,
  chunk_index INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast similarity search
CREATE INDEX uae_tax_kb_embedding_idx
  ON uae_tax_kb
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Similarity search function
CREATE OR REPLACE FUNCTION search_uae_tax_kb(
  query_embedding vector(384),
  match_count     INT DEFAULT 8,
  filter_law_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id           UUID,
  content      TEXT,
  jurisdiction TEXT,
  law_type     TEXT,
  doc_name     TEXT,
  similarity   FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id, k.content, k.jurisdiction,
    k.law_type, k.doc_name,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM uae_tax_kb k
  WHERE
    filter_law_type IS NULL
    OR k.law_type = filter_law_type
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
