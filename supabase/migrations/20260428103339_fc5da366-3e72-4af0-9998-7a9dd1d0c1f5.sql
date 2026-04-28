ALTER TABLE public.rma_requests
  ADD COLUMN IF NOT EXISTS shipping_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rma_requests_reminder_lookup
  ON public.rma_requests (status, shipping_reminder_sent_at, created_at)
  WHERE status = 'registered' AND shipping_reminder_sent_at IS NULL;