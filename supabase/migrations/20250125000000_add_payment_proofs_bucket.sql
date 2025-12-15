-- Create a new storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public (anon) to upload files
CREATE POLICY "Allow public uploads to payment-proofs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'payment-proofs');

-- Policy: Allow public to view files (required for Admin dashboard)
CREATE POLICY "Allow public view of payment-proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

-- Policy: Allow authenticated users (admin) to delete files
CREATE POLICY "Allow admin delete of payment-proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-proofs');
