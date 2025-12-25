-- Step 1: Fix rma_requests table RLS policies
DROP POLICY IF EXISTS "Admins can view all RMA requests" ON public.rma_requests;
DROP POLICY IF EXISTS "Admins can update RMA requests" ON public.rma_requests;
DROP POLICY IF EXISTS "Admins can delete RMA requests" ON public.rma_requests;
DROP POLICY IF EXISTS "Anyone can create RMA requests" ON public.rma_requests;

-- Recreate policies with authenticated role
CREATE POLICY "Admins can view all RMA requests" 
ON public.rma_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update RMA requests" 
ON public.rma_requests
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete RMA requests" 
ON public.rma_requests
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Keep INSERT open for public RMA submissions (anonymous users can submit RMA)
CREATE POLICY "Anyone can create RMA requests" 
ON public.rma_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Step 2: Fix pending_admin_registrations table RLS policies
DROP POLICY IF EXISTS "Admins can view pending registrations" ON public.pending_admin_registrations;
DROP POLICY IF EXISTS "Users can register for admin" ON public.pending_admin_registrations;
DROP POLICY IF EXISTS "Admins can update pending registrations" ON public.pending_admin_registrations;
DROP POLICY IF EXISTS "Admins can delete pending registrations" ON public.pending_admin_registrations;

-- Recreate policies with authenticated role
CREATE POLICY "Admins can view pending registrations" 
ON public.pending_admin_registrations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can register for admin" 
ON public.pending_admin_registrations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update pending registrations" 
ON public.pending_admin_registrations
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pending registrations" 
ON public.pending_admin_registrations
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));