ALTER TABLE public.rma_requests
ADD COLUMN IF NOT EXISTS follow_up_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rma_requests_follow_up_due
  ON public.rma_requests (follow_up_due_at)
  WHERE status = 'follow_up';