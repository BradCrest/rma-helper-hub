-- Drop existing public read policies
DROP POLICY IF EXISTS "Anyone can view RMA by number" ON public.rma_requests;
DROP POLICY IF EXISTS "Anyone can view status history" ON public.rma_status_history;

-- Create new policies: Only admins can read all RMA requests
CREATE POLICY "Admins can view all RMA requests"
ON public.rma_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create new policies: Only admins can read all status history
CREATE POLICY "Admins can view all status history"
ON public.rma_status_history
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));