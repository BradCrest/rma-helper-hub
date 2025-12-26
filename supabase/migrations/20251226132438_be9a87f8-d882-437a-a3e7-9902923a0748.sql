-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table to store RMA embeddings for RAG
CREATE TABLE public.rma_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'full_record',
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rma_request_id, content_type)
);

-- Create HNSW index for fast vector similarity search
CREATE INDEX rma_embeddings_embedding_idx ON public.rma_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Create index on rma_request_id for quick lookups
CREATE INDEX rma_embeddings_rma_request_id_idx ON public.rma_embeddings(rma_request_id);

-- Enable RLS
ALTER TABLE public.rma_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can manage embeddings
CREATE POLICY "Admins can view all embeddings"
ON public.rma_embeddings
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert embeddings"
ON public.rma_embeddings
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update embeddings"
ON public.rma_embeddings
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Super admins can delete embeddings"
ON public.rma_embeddings
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_rma_embeddings_updated_at
BEFORE UPDATE ON public.rma_embeddings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function for semantic search
CREATE OR REPLACE FUNCTION public.search_rma_embeddings(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  rma_request_id UUID,
  content TEXT,
  content_type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.rma_request_id,
    e.content,
    e.content_type,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM rma_embeddings e
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;