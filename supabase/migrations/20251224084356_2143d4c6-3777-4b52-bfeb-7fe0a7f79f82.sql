
-- =====================================================
-- 1. 擴充 rma_requests 表 - 新增欄位
-- =====================================================
ALTER TABLE public.rma_requests
ADD COLUMN IF NOT EXISTS customer_type TEXT,
ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
ADD COLUMN IF NOT EXISTS social_account TEXT,
ADD COLUMN IF NOT EXISTS received_date DATE,
ADD COLUMN IF NOT EXISTS customer_issue TEXT,
ADD COLUMN IF NOT EXISTS initial_diagnosis TEXT,
ADD COLUMN IF NOT EXISTS diagnosis_category TEXT,
ADD COLUMN IF NOT EXISTS customer_notes TEXT,
ADD COLUMN IF NOT EXISTS warranty_date DATE,
ADD COLUMN IF NOT EXISTS warranty_status TEXT;

-- =====================================================
-- 2. 建立 rma_repair_details 表 (維修詳情)
-- =====================================================
CREATE TABLE public.rma_repair_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  planned_method TEXT,
  estimated_cost DECIMAL(10, 2),
  actual_method TEXT,
  actual_cost DECIMAL(10, 2),
  replacement_model TEXT,
  replacement_serial TEXT,
  internal_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(rma_request_id)
);

-- Enable RLS
ALTER TABLE public.rma_repair_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rma_repair_details
CREATE POLICY "Admins can view all repair details"
ON public.rma_repair_details
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert repair details"
ON public.rma_repair_details
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update repair details"
ON public.rma_repair_details
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete repair details"
ON public.rma_repair_details
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_rma_repair_details_updated_at
BEFORE UPDATE ON public.rma_repair_details
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 3. 建立 rma_supplier_repairs 表 (供應商維修記錄)
-- =====================================================
CREATE TABLE public.rma_supplier_repairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  repair_requirement TEXT,
  supplier_status TEXT,
  sent_to_factory_date DATE,
  sent_carrier TEXT,
  sent_tracking_number TEXT,
  supplier_warranty_date DATE,
  production_batch TEXT,
  factory_analysis TEXT,
  factory_repair_method TEXT,
  factory_repair_cost DECIMAL(10, 2),
  factory_return_date DATE,
  inspection_result TEXT,
  repair_count INTEGER DEFAULT 1,
  post_repair_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rma_supplier_repairs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rma_supplier_repairs
CREATE POLICY "Admins can view all supplier repairs"
ON public.rma_supplier_repairs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert supplier repairs"
ON public.rma_supplier_repairs
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update supplier repairs"
ON public.rma_supplier_repairs
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete supplier repairs"
ON public.rma_supplier_repairs
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_rma_supplier_repairs_updated_at
BEFORE UPDATE ON public.rma_supplier_repairs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4. 建立 rma_customer_contacts 表 (客戶聯繫記錄)
-- =====================================================
CREATE TABLE public.rma_customer_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  contact_date DATE NOT NULL,
  contact_method TEXT,
  contact_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rma_customer_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rma_customer_contacts
CREATE POLICY "Admins can view all customer contacts"
ON public.rma_customer_contacts
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert customer contacts"
ON public.rma_customer_contacts
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update customer contacts"
ON public.rma_customer_contacts
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete customer contacts"
ON public.rma_customer_contacts
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 5. 建立 rma_customer_feedback 表 (客戶回饋)
-- =====================================================
CREATE TABLE public.rma_customer_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  follow_up_date DATE,
  follow_up_method TEXT,
  satisfaction_score INTEGER CHECK (satisfaction_score >= 1 AND satisfaction_score <= 5),
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rma_customer_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rma_customer_feedback
CREATE POLICY "Admins can view all customer feedback"
ON public.rma_customer_feedback
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert customer feedback"
ON public.rma_customer_feedback
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update customer feedback"
ON public.rma_customer_feedback
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete customer feedback"
ON public.rma_customer_feedback
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 6. 建立索引以優化查詢效能
-- =====================================================
CREATE INDEX idx_rma_repair_details_rma_request_id ON public.rma_repair_details(rma_request_id);
CREATE INDEX idx_rma_supplier_repairs_rma_request_id ON public.rma_supplier_repairs(rma_request_id);
CREATE INDEX idx_rma_customer_contacts_rma_request_id ON public.rma_customer_contacts(rma_request_id);
CREATE INDEX idx_rma_customer_feedback_rma_request_id ON public.rma_customer_feedback(rma_request_id);
