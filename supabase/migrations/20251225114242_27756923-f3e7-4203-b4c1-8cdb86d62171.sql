-- Create a helper function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'super_admin')
  )
$$;

-- Update RLS policies for rma_requests
DROP POLICY IF EXISTS "Admins can view all RMA requests" ON public.rma_requests;
CREATE POLICY "Admins can view all RMA requests" ON public.rma_requests
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update RMA requests" ON public.rma_requests;
CREATE POLICY "Admins can update RMA requests" ON public.rma_requests
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for rma_shipping
DROP POLICY IF EXISTS "Admins can view all shipping" ON public.rma_shipping;
DROP POLICY IF EXISTS "Admins can view shipping info" ON public.rma_shipping;
CREATE POLICY "Admins can view all shipping" ON public.rma_shipping
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert shipping" ON public.rma_shipping;
CREATE POLICY "Admins can insert shipping" ON public.rma_shipping
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update shipping" ON public.rma_shipping;
CREATE POLICY "Admins can update shipping" ON public.rma_shipping
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for rma_status_history
DROP POLICY IF EXISTS "Admins can view all status history" ON public.rma_status_history;
DROP POLICY IF EXISTS "Admins can view status history" ON public.rma_status_history;
CREATE POLICY "Admins can view all status history" ON public.rma_status_history
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert status history" ON public.rma_status_history;
CREATE POLICY "Admins can insert status history" ON public.rma_status_history
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- Update RLS policies for rma_customer_contacts
DROP POLICY IF EXISTS "Admins can view all customer contacts" ON public.rma_customer_contacts;
DROP POLICY IF EXISTS "Admins can view customer contacts" ON public.rma_customer_contacts;
CREATE POLICY "Admins can view all customer contacts" ON public.rma_customer_contacts
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert customer contacts" ON public.rma_customer_contacts;
CREATE POLICY "Admins can insert customer contacts" ON public.rma_customer_contacts
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update customer contacts" ON public.rma_customer_contacts;
CREATE POLICY "Admins can update customer contacts" ON public.rma_customer_contacts
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for rma_customer_feedback
DROP POLICY IF EXISTS "Admins can view all customer feedback" ON public.rma_customer_feedback;
DROP POLICY IF EXISTS "Admins can view customer feedback" ON public.rma_customer_feedback;
CREATE POLICY "Admins can view all customer feedback" ON public.rma_customer_feedback
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert customer feedback" ON public.rma_customer_feedback;
CREATE POLICY "Admins can insert customer feedback" ON public.rma_customer_feedback
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update customer feedback" ON public.rma_customer_feedback;
CREATE POLICY "Admins can update customer feedback" ON public.rma_customer_feedback
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for rma_repair_details
DROP POLICY IF EXISTS "Admins can view all repair details" ON public.rma_repair_details;
DROP POLICY IF EXISTS "Admins can view repair details" ON public.rma_repair_details;
CREATE POLICY "Admins can view all repair details" ON public.rma_repair_details
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert repair details" ON public.rma_repair_details;
CREATE POLICY "Admins can insert repair details" ON public.rma_repair_details
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update repair details" ON public.rma_repair_details;
CREATE POLICY "Admins can update repair details" ON public.rma_repair_details
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for rma_supplier_repairs
DROP POLICY IF EXISTS "Admins can view all supplier repairs" ON public.rma_supplier_repairs;
DROP POLICY IF EXISTS "Admins can view supplier repairs" ON public.rma_supplier_repairs;
CREATE POLICY "Admins can view all supplier repairs" ON public.rma_supplier_repairs
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert supplier repairs" ON public.rma_supplier_repairs;
CREATE POLICY "Admins can insert supplier repairs" ON public.rma_supplier_repairs
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update supplier repairs" ON public.rma_supplier_repairs;
CREATE POLICY "Admins can update supplier repairs" ON public.rma_supplier_repairs
  FOR UPDATE USING (is_admin(auth.uid()));

-- Update RLS policies for user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view user roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- Update RLS policies for pending_admin_registrations
DROP POLICY IF EXISTS "Admins can view pending registrations" ON public.pending_admin_registrations;
CREATE POLICY "Admins can view pending registrations" ON public.pending_admin_registrations
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update pending registrations" ON public.pending_admin_registrations;
CREATE POLICY "Admins can update pending registrations" ON public.pending_admin_registrations
  FOR UPDATE USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete pending registrations" ON public.pending_admin_registrations;
CREATE POLICY "Admins can delete pending registrations" ON public.pending_admin_registrations
  FOR DELETE USING (is_admin(auth.uid()));