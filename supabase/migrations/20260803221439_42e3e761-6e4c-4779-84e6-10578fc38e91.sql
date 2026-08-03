CREATE POLICY "Users can view own wardrobe photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wardrobe-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload own wardrobe photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wardrobe-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own wardrobe photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'wardrobe-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'wardrobe-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own wardrobe photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wardrobe-photos' AND (storage.foldername(name))[1] = auth.uid()::text);