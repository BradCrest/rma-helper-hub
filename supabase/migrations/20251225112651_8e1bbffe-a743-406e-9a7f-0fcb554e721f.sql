-- Fix all remaining RLS policy issues

-- 1. rma_customer_contacts - Add SELECT policy for admins only
CREATE POLICY "Admins can view customer contacts" 
ON public.rma_customer_contacts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. rma_customer_feedback - Add SELECT policy for admins only
CREATE POLICY "Admins can view customer feedback" 
ON public.rma_customer_feedback
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. rma_repair_details - Add SELECT policy for admins only
CREATE POLICY "Admins can view repair details" 
ON public.rma_repair_details
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. rma_shipping - Add SELECT policy for admins only
CREATE POLICY "Admins can view shipping info" 
ON public.rma_shipping
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. rma_status_history - Add SELECT policy for admins only
CREATE POLICY "Admins can view status history" 
ON public.rma_status_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. rma_supplier_repairs - Add SELECT policy for admins only
CREATE POLICY "Admins can view supplier repairs" 
ON public.rma_supplier_repairs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. user_roles - Add SELECT policy for admins only
DROP POLICY IF EXISTS "Admins can view user roles" ON public.user_roles;
CREATE POLICY "Admins can view user roles" 
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));