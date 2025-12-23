-- Add photo_urls column to rma_requests table
ALTER TABLE public.rma_requests 
ADD COLUMN photo_urls TEXT[] DEFAULT NULL;

-- Create storage bucket for RMA photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('rma-photos', 'rma-photos', true);

-- Allow anyone to upload to rma-photos bucket
CREATE POLICY "Anyone can upload RMA photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'rma-photos');

-- Allow anyone to view RMA photos
CREATE POLICY "Anyone can view RMA photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'rma-photos');