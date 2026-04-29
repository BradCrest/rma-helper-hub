
-- 1. rma_thread_messages
CREATE TABLE public.rma_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_request_id uuid NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  subject text,
  body text NOT NULL,
  from_name text,
  from_email text,
  gmail_message_id text,
  reply_token text UNIQUE,
  reply_token_expires_at timestamptz,
  reply_token_used_at timestamptz,
  parent_message_id uuid REFERENCES public.rma_thread_messages(id) ON DELETE SET NULL,
  created_by uuid,
  read_by_admin_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rma_thread_messages_rma ON public.rma_thread_messages(rma_request_id, created_at DESC);
CREATE INDEX idx_rma_thread_messages_token ON public.rma_thread_messages(reply_token) WHERE reply_token IS NOT NULL;

ALTER TABLE public.rma_thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rma thread messages"
  ON public.rma_thread_messages FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert rma thread messages"
  ON public.rma_thread_messages FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update rma thread messages"
  ON public.rma_thread_messages FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete rma thread messages"
  ON public.rma_thread_messages FOR DELETE
  USING (is_admin(auth.uid()));

-- 2. unread flag on rma_requests
ALTER TABLE public.rma_requests
  ADD COLUMN IF NOT EXISTS has_unread_customer_reply boolean NOT NULL DEFAULT false;

-- 3. trigger: when inbound message inserted, mark rma as unread
CREATE OR REPLACE FUNCTION public.mark_rma_unread_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.rma_requests
       SET has_unread_customer_reply = true
     WHERE id = NEW.rma_request_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_rma_unread_on_inbound
AFTER INSERT ON public.rma_thread_messages
FOR EACH ROW
EXECUTE FUNCTION public.mark_rma_unread_on_inbound();
