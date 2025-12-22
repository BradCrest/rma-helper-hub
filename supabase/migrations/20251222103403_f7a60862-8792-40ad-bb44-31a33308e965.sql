-- Create enum for RMA status
CREATE TYPE public.rma_status AS ENUM (
  'pending',      -- 待處理
  'processing',   -- 處理中
  'shipped',      -- 已寄出
  'received',     -- 已收到
  'repairing',    -- 維修中
  'completed',    -- 已完成
  'cancelled'     -- 已取消
);

-- Create RMA requests table
CREATE TABLE public.rma_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number TEXT UNIQUE NOT NULL,
  
  -- Customer info
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  
  -- Product info
  product_name TEXT NOT NULL,
  product_model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  
  -- Issue details
  issue_type TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  
  -- Status
  status rma_status NOT NULL DEFAULT 'pending',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create RMA status history table
CREATE TABLE public.rma_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  status rma_status NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shipping info table
CREATE TABLE public.rma_shipping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_request_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')), -- 寄來/寄回
  tracking_number TEXT,
  carrier TEXT,
  ship_date DATE,
  delivery_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rma_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_shipping ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rma_requests
-- Anyone can create a new RMA request
CREATE POLICY "Anyone can create RMA requests"
ON public.rma_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Customers can view their own RMA by email or phone (using rma_number lookup)
CREATE POLICY "Anyone can view RMA by number"
ON public.rma_requests
FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can update RMA requests
CREATE POLICY "Admins can update RMA requests"
ON public.rma_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete RMA requests
CREATE POLICY "Admins can delete RMA requests"
ON public.rma_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for rma_status_history
CREATE POLICY "Anyone can view status history"
ON public.rma_status_history
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can insert status history"
ON public.rma_status_history
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for rma_shipping
CREATE POLICY "Anyone can view shipping info"
ON public.rma_shipping
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can manage shipping"
ON public.rma_shipping
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create function to generate RMA number
CREATE OR REPLACE FUNCTION public.generate_rma_number()
RETURNS TRIGGER AS $$
DECLARE
  today_count INTEGER;
  today_date TEXT;
BEGIN
  today_date := TO_CHAR(NOW(), 'YYYYMMDD');
  
  SELECT COUNT(*) + 1 INTO today_count
  FROM public.rma_requests
  WHERE rma_number LIKE 'RMA-' || today_date || '-%';
  
  NEW.rma_number := 'RMA-' || today_date || '-' || LPAD(today_count::TEXT, 3, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to auto-generate RMA number
CREATE TRIGGER generate_rma_number_trigger
BEFORE INSERT ON public.rma_requests
FOR EACH ROW
WHEN (NEW.rma_number IS NULL OR NEW.rma_number = '')
EXECUTE FUNCTION public.generate_rma_number();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_rma_requests_updated_at
BEFORE UPDATE ON public.rma_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rma_shipping_updated_at
BEFORE UPDATE ON public.rma_shipping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-insert status history on status change
CREATE OR REPLACE FUNCTION public.log_rma_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.rma_status_history (rma_request_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for status history
CREATE TRIGGER log_rma_status_change_trigger
AFTER UPDATE ON public.rma_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_rma_status_change();

-- Create indexes for better performance
CREATE INDEX idx_rma_requests_status ON public.rma_requests(status);
CREATE INDEX idx_rma_requests_customer_email ON public.rma_requests(customer_email);
CREATE INDEX idx_rma_requests_customer_phone ON public.rma_requests(customer_phone);
CREATE INDEX idx_rma_requests_created_at ON public.rma_requests(created_at DESC);
CREATE INDEX idx_rma_status_history_request_id ON public.rma_status_history(rma_request_id);
CREATE INDEX idx_rma_shipping_request_id ON public.rma_shipping(rma_request_id);