-- 2. Create is_super_admin function
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
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
      AND role = 'super_admin'
  )
$$;

-- 3. Update brad@crestdiving.com to super_admin role
UPDATE public.user_roles 
SET role = 'super_admin' 
WHERE user_id = '278861f2-aa67-472d-ab66-e5f9316aad31';

-- 4. Update user_roles DELETE policy - only super_admin can delete
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Super admins can delete roles" 
ON public.user_roles
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 5. Update rma_requests DELETE policy - only super_admin can delete
DROP POLICY IF EXISTS "Admins can delete RMA requests" ON public.rma_requests;
CREATE POLICY "Super admins can delete RMA requests" 
ON public.rma_requests
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 6. Update rma_customer_contacts DELETE policy
DROP POLICY IF EXISTS "Admins can delete customer contacts" ON public.rma_customer_contacts;
CREATE POLICY "Super admins can delete customer contacts" 
ON public.rma_customer_contacts
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 7. Update rma_customer_feedback DELETE policy
DROP POLICY IF EXISTS "Admins can delete customer feedback" ON public.rma_customer_feedback;
CREATE POLICY "Super admins can delete customer feedback" 
ON public.rma_customer_feedback
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 8. Update rma_repair_details DELETE policy
DROP POLICY IF EXISTS "Admins can delete repair details" ON public.rma_repair_details;
CREATE POLICY "Super admins can delete repair details" 
ON public.rma_repair_details
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 9. Update rma_shipping DELETE policy
DROP POLICY IF EXISTS "Admins can manage shipping" ON public.rma_shipping;
CREATE POLICY "Admins can update shipping" 
ON public.rma_shipping
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admins can delete shipping" 
ON public.rma_shipping
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 10. Update rma_supplier_repairs DELETE policy
DROP POLICY IF EXISTS "Admins can delete supplier repairs" ON public.rma_supplier_repairs;
CREATE POLICY "Super admins can delete supplier repairs" 
ON public.rma_supplier_repairs
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 11. Add DELETE policy for rma_status_history (super_admin only)
CREATE POLICY "Super admins can delete status history" 
ON public.rma_status_history
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));