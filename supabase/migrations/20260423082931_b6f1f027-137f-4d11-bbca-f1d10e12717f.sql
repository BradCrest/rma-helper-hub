-- Tighten rma-photos bucket: require uploads under 'rma/' prefix, restrict file extension/size context.
-- Keep public read because the customer tracking page uses public URLs for anonymous customers.

DROP POLICY IF EXISTS "Anyone can upload RMA photos" ON storage.objects;

CREATE POLICY "Anyone can upload RMA photos to rma path"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'rma-photos'
  AND (storage.foldername(name))[1] = 'rma'
  AND length(name) < 512
  AND lower(storage.extension(name)) = ANY (ARRAY['jpg','jpeg','png','webp','heic','heif','gif'])
);

-- Block anonymous overwrite/delete on rma-photos. Only admins can update/delete.
CREATE POLICY "Admins can update RMA photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'rma-photos' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete RMA photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'rma-photos' AND is_admin(auth.uid()));