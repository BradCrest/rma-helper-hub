-- ============================================
-- Table: ai_settings
-- ============================================
CREATE TABLE public.ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai settings"
  ON public.ai_settings FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Super admins can insert ai settings"
  ON public.ai_settings FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update ai settings"
  ON public.ai_settings FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete ai settings"
  ON public.ai_settings FOR DELETE
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default model settings
INSERT INTO public.ai_settings (setting_key, setting_value) VALUES
  ('slack_reply_model', '"google/gemini-2.5-pro"'::jsonb),
  ('admin_chat_model', '"google/gemini-2.5-flash"'::jsonb);

-- ============================================
-- Table: email_knowledge_sources
-- ============================================
CREATE TABLE public.email_knowledge_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('faq', 'template', 'email')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email knowledge sources"
  ON public.email_knowledge_sources FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email knowledge sources"
  ON public.email_knowledge_sources FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update email knowledge sources"
  ON public.email_knowledge_sources FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete email knowledge sources"
  ON public.email_knowledge_sources FOR DELETE
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_email_knowledge_sources_updated_at
  BEFORE UPDATE ON public.email_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_knowledge_sources_type ON public.email_knowledge_sources(source_type);

-- ============================================
-- Table: email_embeddings
-- ============================================
CREATE TABLE public.email_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.email_knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email embeddings"
  ON public.email_embeddings FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email embeddings"
  ON public.email_embeddings FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update email embeddings"
  ON public.email_embeddings FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete email embeddings"
  ON public.email_embeddings FOR DELETE
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_email_embeddings_updated_at
  BEFORE UPDATE ON public.email_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- HNSW index for fast similarity search
CREATE INDEX idx_email_embeddings_vector ON public.email_embeddings 
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_email_embeddings_status ON public.email_embeddings(status);
CREATE INDEX idx_email_embeddings_source ON public.email_embeddings(source_id);

-- ============================================
-- Trigger: mark embedding pending on source insert/update
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_email_embedding_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_embeddings WHERE source_id = NEW.id) THEN
    UPDATE public.email_embeddings
    SET status = 'pending', content = NEW.content, updated_at = now()
    WHERE source_id = NEW.id;
  ELSE
    INSERT INTO public.email_embeddings (source_id, content, status)
    VALUES (NEW.id, NEW.content, 'pending');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_email_source_mark_pending
  AFTER INSERT OR UPDATE OF content ON public.email_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.mark_email_embedding_pending();

-- ============================================
-- RPC: search_email_embeddings
-- ============================================
CREATE OR REPLACE FUNCTION public.search_email_embeddings(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  source_id uuid,
  content text,
  source_type text,
  title text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.source_id,
    e.content,
    s.source_type,
    s.title,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.email_embeddings e
  JOIN public.email_knowledge_sources s ON s.id = e.source_id
  WHERE e.embedding IS NOT NULL
    AND e.status = 'completed'
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;