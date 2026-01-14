-- 1. 建立 RMA 刪除日誌表
CREATE TABLE public.rma_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  product_name text NOT NULL,
  product_model text,
  serial_number text,
  status text NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_by_email text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  rma_data jsonb NOT NULL
);

-- 啟用 RLS
ALTER TABLE public.rma_deletion_logs ENABLE ROW LEVEL SECURITY;

-- RLS 政策
CREATE POLICY "Admins can view deletion logs"
  ON public.rma_deletion_logs FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert deletion logs"
  ON public.rma_deletion_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Super admins can delete deletion logs"
  ON public.rma_deletion_logs FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- 2. 修改 rma_requests 的 DELETE 政策
DROP POLICY IF EXISTS "Super admins can delete RMA requests" ON public.rma_requests;
CREATE POLICY "Admins can delete RMA requests"
  ON public.rma_requests FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

-- 3. 修改相關子表的 DELETE 政策
DROP POLICY IF EXISTS "Super admins can delete customer feedback" ON public.rma_customer_feedback;
CREATE POLICY "Admins can delete customer feedback"
  ON public.rma_customer_feedback FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete customer contacts" ON public.rma_customer_contacts;
CREATE POLICY "Admins can delete customer contacts"
  ON public.rma_customer_contacts FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete supplier repairs" ON public.rma_supplier_repairs;
CREATE POLICY "Admins can delete supplier repairs"
  ON public.rma_supplier_repairs FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete repair details" ON public.rma_repair_details;
CREATE POLICY "Admins can delete repair details"
  ON public.rma_repair_details FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete shipping" ON public.rma_shipping;
CREATE POLICY "Admins can delete shipping"
  ON public.rma_shipping FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete status history" ON public.rma_status_history;
CREATE POLICY "Admins can delete status history"
  ON public.rma_status_history FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete embeddings" ON public.rma_embeddings;
CREATE POLICY "Admins can delete embeddings"
  ON public.rma_embeddings FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));