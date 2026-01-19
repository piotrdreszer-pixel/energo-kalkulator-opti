-- Create storage bucket for rate documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('rate-documents', 'rate-documents', false);

-- Allow authenticated users to upload files
CREATE POLICY "Admins can upload rate documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rate-documents' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to read files
CREATE POLICY "Admins can read rate documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'rate-documents' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete files
CREATE POLICY "Admins can delete rate documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'rate-documents' 
  AND public.has_role(auth.uid(), 'admin')
);