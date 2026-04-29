-- Enable extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cleanup audit log table
CREATE TABLE public.rma_attachment_cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_run_at timestamptz NOT NULL DEFAULT now(),
  trigger_source text NOT NULL DEFAULT 'cron',
  files_deleted integer NOT NULL DEFAULT 0,
  bytes_freed bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);

ALTER TABLE public.rma_attachment_cleanup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cleanup logs"
ON public.rma_attachment_cleanup_logs
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert cleanup logs"
ON public.rma_attachment_cleanup_logs
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_cleanup_logs_run_at ON public.rma_attachment_cleanup_logs(cleanup_run_at DESC);