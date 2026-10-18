-- Etap 2: import faktur energetycznych (dokumenty, rozliczenia PPE, pozycje)

CREATE OR REPLACE FUNCTION public.can_access_analysis_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.analysis_groups g
    JOIN public.client_projects p ON p.id = g.client_project_id
    WHERE g.id = _group_id
      AND (
        p.created_by_user_id = auth.uid()
        OR public.is_manager_of(p.created_by_user_id)
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_app_owner()
      )
  )
$$;

CREATE TABLE public.analysis_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_hash text,
  mime_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','needs_review','approved','error')),
  doc_type text,
  issuer text,
  document_number text,
  buyer_nip text,
  corrected_document_number text,
  extracted jsonb,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_documents TO authenticated;
GRANT ALL ON public.analysis_documents TO service_role;
ALTER TABLE public.analysis_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access analysis_documents" ON public.analysis_documents FOR ALL TO authenticated
  USING (public.can_access_analysis_group(analysis_group_id))
  WITH CHECK (public.can_access_analysis_group(analysis_group_id));

CREATE TABLE public.document_ppe_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.analysis_documents(id) ON DELETE CASCADE,
  ppe_number text,
  ppe_address text,
  tariff_code text,
  osd_name text,
  period_from date,
  period_to date,
  contracted_power_kw numeric,
  max_power_kw numeric,
  power_exceedances jsonb,
  consumption jsonb,
  reactive jsonb,
  other_charges jsonb,
  source_pages jsonb,
  matched_analysis_id uuid REFERENCES public.energy_analyses(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched','new','ambiguous','unmatched')),
  applied_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ppe_records TO authenticated;
GRANT ALL ON public.document_ppe_records TO service_role;
ALTER TABLE public.document_ppe_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access document_ppe_records" ON public.document_ppe_records FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.analysis_documents d WHERE d.id = document_id AND public.can_access_analysis_group(d.analysis_group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.analysis_documents d WHERE d.id = document_id AND public.can_access_analysis_group(d.analysis_group_id)));

CREATE TABLE public.document_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.analysis_documents(id) ON DELETE CASCADE,
  ppe_record_id uuid REFERENCES public.document_ppe_records(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  rate numeric,
  net_value numeric,
  vat_rate numeric,
  gross_value numeric,
  category text,
  page integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_line_items TO authenticated;
GRANT ALL ON public.document_line_items TO service_role;
ALTER TABLE public.document_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access document_line_items" ON public.document_line_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.analysis_documents d WHERE d.id = document_id AND public.can_access_analysis_group(d.analysis_group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.analysis_documents d WHERE d.id = document_id AND public.can_access_analysis_group(d.analysis_group_id)));

CREATE TRIGGER set_analysis_documents_updated_at BEFORE UPDATE ON public.analysis_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();