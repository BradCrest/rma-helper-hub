ALTER TABLE public.rma_requests
  ADD COLUMN IF NOT EXISTS updated_by_email text;