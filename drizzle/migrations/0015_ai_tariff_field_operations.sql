ALTER TABLE public.ai_proposals DROP CONSTRAINT ai_proposals_kind_check;
ALTER TABLE public.ai_proposals ADD CONSTRAINT ai_proposals_kind_check CHECK (kind = ANY (ARRAY['po','period','estimate','estimate_replace','tariff_po','tariff_przed','field_przed','report_selection']));
ALTER TABLE public.ai_proposals ADD COLUMN IF NOT EXISTS command text, ADD COLUMN IF NOT EXISTS result_before jsonb, ADD COLUMN IF NOT EXISTS result_after jsonb;
ALTER TABLE public.ai_applied_changes ADD COLUMN IF NOT EXISTS command text, ADD COLUMN IF NOT EXISTS result_before jsonb, ADD COLUMN IF NOT EXISTS result_after jsonb;

CREATE OR REPLACE FUNCTION public.ai_allowed_fields(_kind text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _kind
    WHEN 'po' THEN public.ai_allowed_po_fields()
    WHEN 'period' THEN ARRAY['period_from','period_to']
    WHEN 'estimate' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'estimate_replace' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'tariff_po' THEN public.ai_allowed_po_fields() || ARRAY['tariff_code_after','zones_count_after','season_after','rate_card_id_after','rates_year_after','rates_source_after','rates_overridden_after',
      'fixed_distribution_after_total','contracted_power_charge_rate_after','variable_distribution_after_zone1_rate','variable_distribution_after_zone2_rate','variable_distribution_after_zone3_rate',
      'consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh']
    WHEN 'tariff_przed' THEN ARRAY['tariff_code_before','zones_count_before','season_before','rate_card_id_before','rates_year_before','rates_source_before','rates_overridden_before','contracted_power_before_kw',
      'fixed_distribution_before_total','contracted_power_charge_rate_before','variable_distribution_before_zone1_rate','variable_distribution_before_zone2_rate','variable_distribution_before_zone3_rate',
      'active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh']
    WHEN 'field_przed' THEN ARRAY['contracted_power_before_kw','active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','handling_fee_before','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'report_selection' THEN ARRAY['include_in_project_report']
    ELSE ARRAY[]::text[] END
$$;

CREATE OR REPLACE FUNCTION public.ai_proposal_guard(_p ai_proposals) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR _p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Brak dostępu do tej propozycji'; END IF;
  IF NOT public.has_feature_access('ai_assistant') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Asystent AI'; END IF;
  IF _p.kind IN ('period','estimate','estimate_replace') AND NOT public.has_feature_access('invoice_import') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Import faktur'; END IF;
  IF _p.kind = 'report_selection' AND NOT public.has_feature_access('multi_ppe') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Analizy wielu PPE'; END IF;
  IF NOT public.can_access_analysis_group(_p.analysis_group_id) OR NOT public.ai_can_edit_analysis(_p.analysis_id) OR NOT public.can_edit_feature_group(_p.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
  IF _p.status = 'pending' AND _p.kind = 'tariff_po' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE '%_before%') THEN RAISE EXCEPTION 'Zmiana taryfy PO nie może zmieniać PRZED'; END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE 'consumption_after_%') THEN RAISE EXCEPTION 'Szacunek z faktur dotyczy wyłącznie PRZED. Przygotuj nową propozycję bez automatycznej zmiany PO'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' IN ('capacity_charge_before','reactive_energy_cost_before')) AND jsonb_array_length(_p.changes) <> 1 THEN RAISE EXCEPTION 'Każdy koszt wymaga osobnej propozycji i akceptacji'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p.estimates->'create','[]'::jsonb)) e WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e->>'field')) THEN RAISE EXCEPTION 'Szacunek nie odpowiada zatwierdzonym polom'; END IF;
  END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate_replace' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(_p.estimates->'replace','[]'::jsonb)) x WHERE NOT EXISTS (SELECT 1 FROM public.analysis_estimates e WHERE e.id=x::uuid AND e.analysis_id=_p.analysis_id AND e.status='active' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e.field))) THEN RAISE EXCEPTION 'Zastępowany szacunek nie odpowiada tej analizie i zatwierdzonym polom'; END IF;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.ai_copy_proposal_meta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT p.command, p.result_before, p.result_after INTO NEW.command, NEW.result_before, NEW.result_after FROM public.ai_proposals p WHERE p.id = NEW.proposal_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ai_applied_changes_meta ON public.ai_applied_changes;
CREATE TRIGGER ai_applied_changes_meta BEFORE INSERT ON public.ai_applied_changes FOR EACH ROW EXECUTE FUNCTION public.ai_copy_proposal_meta();