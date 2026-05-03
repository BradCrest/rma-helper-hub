-- 1a. rma_supplier_repairs 補欄位
ALTER TABLE public.rma_supplier_repairs
  ADD COLUMN IF NOT EXISTS supplier_name                 text,
  ADD COLUMN IF NOT EXISTS factory_repair_cost_estimated numeric(10,2),
  ADD COLUMN IF NOT EXISTS invoice_reference             text;

-- 1b. 批次表
CREATE TABLE IF NOT EXISTS public.supplier_repair_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name       text NOT NULL,
  status              text NOT NULL DEFAULT 'draft',
  shipped_at          timestamptz,
  tracking_number_out text,
  expected_return_at  date,
  received_at         timestamptz,
  tracking_number_in  text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rma_supplier_repairs
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES public.supplier_repair_batches(id) ON DELETE SET NULL;

-- 1c. 整新品庫存表
CREATE TABLE IF NOT EXISTS public.refurbished_inventory (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_model             text NOT NULL,
  serial_number             text,
  grade                     text NOT NULL CHECK (grade IN ('A','B','C')),
  source_rma_id             uuid REFERENCES public.rma_requests(id)         ON DELETE SET NULL,
  source_supplier_repair_id uuid REFERENCES public.rma_supplier_repairs(id) ON DELETE SET NULL,
  cost                      numeric(10,2),
  status                    text NOT NULL DEFAULT 'in_stock',
  used_for_rma_id           uuid REFERENCES public.rma_requests(id) ON DELETE SET NULL,
  notes                     text,
  received_date             date NOT NULL DEFAULT current_date,
  released_date             date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.supplier_repair_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refurbished_inventory   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view supplier batches"   ON public.supplier_repair_batches FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert supplier batches" ON public.supplier_repair_batches FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update supplier batches" ON public.supplier_repair_batches FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete supplier batches" ON public.supplier_repair_batches FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view refurb inventory"   ON public.refurbished_inventory FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert refurb inventory" ON public.refurbished_inventory FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update refurb inventory" ON public.refurbished_inventory FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete refurb inventory" ON public.refurbished_inventory FOR DELETE USING (public.is_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER update_supplier_repair_batches_updated_at
  BEFORE UPDATE ON public.supplier_repair_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_refurbished_inventory_updated_at
  BEFORE UPDATE ON public.refurbished_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 索引（常用查詢）
CREATE INDEX IF NOT EXISTS idx_supplier_repairs_status      ON public.rma_supplier_repairs(supplier_status);
CREATE INDEX IF NOT EXISTS idx_supplier_repairs_supplier    ON public.rma_supplier_repairs(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_repairs_batch       ON public.rma_supplier_repairs(batch_id);
CREATE INDEX IF NOT EXISTS idx_refurb_inventory_status      ON public.refurbished_inventory(status);
CREATE INDEX IF NOT EXISTS idx_refurb_inventory_model_grade ON public.refurbished_inventory(product_model, grade);