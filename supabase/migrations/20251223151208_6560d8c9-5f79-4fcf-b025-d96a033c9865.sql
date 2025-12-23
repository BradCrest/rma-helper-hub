-- Drop overly permissive policies on rma_shipping
DROP POLICY IF EXISTS "Anyone can view shipping info" ON public.rma_shipping;
DROP POLICY IF EXISTS "Anyone can insert shipping info" ON public.rma_shipping;

-- Create more restrictive policies
-- Only admins can view all shipping info
CREATE POLICY "Admins can view all shipping"
ON public.rma_shipping
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert shipping info (customer shipping is handled via edge function)
CREATE POLICY "Admins can insert shipping"
ON public.rma_shipping
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));