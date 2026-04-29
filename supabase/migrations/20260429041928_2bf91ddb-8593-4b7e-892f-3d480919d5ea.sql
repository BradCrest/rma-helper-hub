-- 1. Create private bucket for RMA reply attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('rma-attachments', 'rma-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS policies for rma-attachments (admin only)
CREATE POLICY "Admins can upload RMA attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'rma-attachments' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can view RMA attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'rma-attachments' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete RMA attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'rma-attachments' AND public.is_admin(auth.uid()));

-- 3. Add attachments column to rma_thread_messages
ALTER TABLE public.rma_thread_messages
ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;