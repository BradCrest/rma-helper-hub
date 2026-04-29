-- Create shared-library bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-library', 'shared-library', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (admins only)
CREATE POLICY "Admins can read shared-library"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'shared-library' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can upload to shared-library"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'shared-library' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update shared-library"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'shared-library' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete shared-library"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'shared-library' AND public.is_admin(auth.uid()));

-- Shared library files metadata
CREATE TABLE public.shared_library_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_name text NOT NULL,
  path text NOT NULL UNIQUE,
  size bigint NOT NULL DEFAULT 0,
  content_type text,
  category text,
  description text,
  uploaded_by uuid,
  uploaded_by_email text,
  download_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_library_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view shared library files"
ON public.shared_library_files FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert shared library files"
ON public.shared_library_files FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update shared library files"
ON public.shared_library_files FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete shared library files"
ON public.shared_library_files FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_shared_library_files_updated_at
BEFORE UPDATE ON public.shared_library_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shared_library_files_category ON public.shared_library_files(category);
CREATE INDEX idx_shared_library_files_created_at ON public.shared_library_files(created_at DESC);