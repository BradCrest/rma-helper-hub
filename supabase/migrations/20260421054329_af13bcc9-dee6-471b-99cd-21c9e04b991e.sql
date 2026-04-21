ALTER TABLE public.email_embeddings
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_embeddings_status_updated_at
  ON public.email_embeddings (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_email_embeddings_processing_started_at
  ON public.email_embeddings (processing_started_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.email_embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle',
  trigger_source TEXT,
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  last_processed_count INTEGER NOT NULL DEFAULT 0,
  last_failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_embedding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email embedding jobs"
ON public.email_embedding_jobs
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email embedding jobs"
ON public.email_embedding_jobs
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update email embedding jobs"
ON public.email_embedding_jobs
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete email embedding jobs"
ON public.email_embedding_jobs
FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_email_embedding_jobs_updated_at
BEFORE UPDATE ON public.email_embedding_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.mark_email_embedding_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_embeddings WHERE source_id = NEW.id) THEN
    UPDATE public.email_embeddings
    SET status = 'pending',
        content = NEW.content,
        embedding = NULL,
        processing_started_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE source_id = NEW.id;
  ELSE
    INSERT INTO public.email_embeddings (
      source_id,
      content,
      status,
      processing_started_at,
      last_error,
      attempt_count
    )
    VALUES (
      NEW.id,
      NEW.content,
      'pending',
      NULL,
      NULL,
      0
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_email_embedding_pending_on_source_change ON public.email_knowledge_sources;

CREATE TRIGGER mark_email_embedding_pending_on_source_change
AFTER INSERT OR UPDATE OF content, title, source_type, metadata, file_name, file_path, file_type, file_size
ON public.email_knowledge_sources
FOR EACH ROW
EXECUTE FUNCTION public.mark_email_embedding_pending();

INSERT INTO public.email_embedding_jobs (job_type, status, trigger_source)
VALUES ('email_knowledge_embedding', 'idle', 'system')
ON CONFLICT (job_type) DO NOTHING;