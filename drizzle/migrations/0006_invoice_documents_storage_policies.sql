-- Prywatny bucket invoice-documents: dostęp wg uprawnień do analizy (pierwszy segment ścieżki = analysis_group_id)
CREATE POLICY "invoice docs select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-documents' AND public.can_access_analysis_group((storage.foldername(name))[1]::uuid));
CREATE POLICY "invoice docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-documents' AND public.can_access_analysis_group((storage.foldername(name))[1]::uuid));
CREATE POLICY "invoice docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-documents' AND public.can_access_analysis_group((storage.foldername(name))[1]::uuid));