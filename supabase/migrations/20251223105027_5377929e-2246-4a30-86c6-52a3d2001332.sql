-- Add photo_url column to rma_shipping table for shipping proof photos
ALTER TABLE public.rma_shipping ADD COLUMN photo_url text;

-- Add RLS policy to allow anyone to insert shipping info (for customers adding their return shipping)
CREATE POLICY "Anyone can insert shipping info"
ON public.rma_shipping
FOR INSERT
WITH CHECK (true);