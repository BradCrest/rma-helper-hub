CREATE TABLE public.rma_followup_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64'),
  satisfaction INT CHECK (satisfaction BETWEEN 1 AND 5),
  comments TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_surveys_rma_id ON public.rma_followup_surveys(rma_id);
CREATE INDEX idx_followup_surveys_token ON public.rma_followup_surveys(token);
CREATE INDEX idx_followup_surveys_submitted_at ON public.rma_followup_surveys(submitted_at);

ALTER TABLE public.rma_followup_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view followup surveys"
ON public.rma_followup_surveys
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete followup surveys"
ON public.rma_followup_surveys
FOR DELETE
USING (is_admin(auth.uid()));
