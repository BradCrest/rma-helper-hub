-- 0. Drop partial indexes that hard-reference rma_status enum
DROP INDEX IF EXISTS public.idx_rma_requests_reminder_lookup;
DROP INDEX IF EXISTS public.idx_rma_requests_follow_up_due;

-- 1. Detach status columns from the enum
ALTER TABLE public.rma_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.rma_requests ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.rma_status_history ALTER COLUMN status TYPE text USING status::text;

-- 2. Migrate offending values
UPDATE public.rma_requests
   SET status = 'received',
       updated_at = now()
 WHERE status IN ('repairing', 'unknown');

UPDATE public.rma_status_history
   SET status = 'received'
 WHERE status IN ('repairing', 'unknown');

-- 3. Rebuild enum
DROP TYPE public.rma_status;

CREATE TYPE public.rma_status AS ENUM (
  'registered',
  'shipped',
  'received',
  'inspecting',
  'contacting',
  'quote_confirmed',
  'paid',
  'no_repair',
  'shipped_back',
  'shipped_back_new',
  'shipped_back_refurbished',
  'shipped_back_original',
  'follow_up',
  'closed'
);

-- 4. Cast columns back to the new enum
ALTER TABLE public.rma_requests
  ALTER COLUMN status TYPE public.rma_status USING status::public.rma_status;
ALTER TABLE public.rma_requests
  ALTER COLUMN status SET DEFAULT 'registered'::public.rma_status;
ALTER TABLE public.rma_requests
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.rma_status_history
  ALTER COLUMN status TYPE public.rma_status USING status::public.rma_status;
ALTER TABLE public.rma_status_history
  ALTER COLUMN status SET NOT NULL;

-- 5. Recreate the partial indexes with the new enum
CREATE INDEX idx_rma_requests_reminder_lookup
  ON public.rma_requests USING btree (status, shipping_reminder_sent_at, created_at)
  WHERE status = 'registered'::public.rma_status
    AND shipping_reminder_sent_at IS NULL;

CREATE INDEX idx_rma_requests_follow_up_due
  ON public.rma_requests USING btree (follow_up_due_at)
  WHERE status = 'follow_up'::public.rma_status;