ALTER TABLE public.email_knowledge_sources
  DROP CONSTRAINT IF EXISTS email_knowledge_sources_source_type_check;

ALTER TABLE public.email_knowledge_sources
  ADD CONSTRAINT email_knowledge_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['faq'::text, 'template'::text, 'email'::text, 'document'::text]));