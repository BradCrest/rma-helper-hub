-- 1. Add file-related columns to email_knowledge_sources
ALTER TABLE public.email_knowledge_sources
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

-- 2. Create private storage bucket for knowledge files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies — admins only
CREATE POLICY "Admins can view knowledge files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'knowledge-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can upload knowledge files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'knowledge-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update knowledge files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'knowledge-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete knowledge files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'knowledge-files' AND public.is_admin(auth.uid()));