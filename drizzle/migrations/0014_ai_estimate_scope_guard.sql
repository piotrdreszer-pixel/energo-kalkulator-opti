CREATE OR REPLACE FUNCTION public.ai_proposal_guard(_p ai_proposals) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR _p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Brak dostępu do tej propozycji'; END IF;
  IF NOT public.has_feature_access('ai_assistant') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Asystent AI'; END IF;
  IF _p.kind <> 'po' AND NOT public.has_feature_access('invoice_import') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Import faktur'; END IF;
  IF NOT public.can_access_analysis_group(_p.analysis_group_id) OR NOT public.ai_can_edit_analysis(_p.analysis_id) OR NOT public.can_edit_feature_group(_p.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE 'consumption_after_%') THEN RAISE EXCEPTION 'Szacunek z faktur dotyczy wyłącznie PRZED. Przygotuj nową propozycję bez automatycznej zmiany PO'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' IN ('capacity_charge_before','reactive_energy_cost_before')) AND jsonb_array_length(_p.changes) <> 1 THEN RAISE EXCEPTION 'Każdy koszt wymaga osobnej propozycji i akceptacji'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p.estimates->'create','[]'::jsonb)) e WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e->>'field')) THEN RAISE EXCEPTION 'Szacunek nie odpowiada zatwierdzonym polom'; END IF;
  END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate_replace' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(_p.estimates->'replace','[]'::jsonb)) x WHERE NOT EXISTS (SELECT 1 FROM public.analysis_estimates e WHERE e.id=x::uuid AND e.analysis_id=_p.analysis_id AND e.status='active' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e.field))) THEN RAISE EXCEPTION 'Zastępowany szacunek nie odpowiada tej analizie i zatwierdzonym polom'; END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.ai_proposal_guard(public.ai_proposals) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_proposal_guard(public.ai_proposals) TO authenticated, service_role;