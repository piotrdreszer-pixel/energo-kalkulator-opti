CREATE OR REPLACE FUNCTION public.ai_allowed_fields(_kind text)
 RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE _kind
    WHEN 'po' THEN public.ai_allowed_po_fields()
    WHEN 'period' THEN ARRAY['period_from','period_to']
    WHEN 'estimate' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'estimate_replace' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'year_simulation' THEN ARRAY['period_from','period_to','consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'tariff_po' THEN public.ai_allowed_po_fields() || ARRAY['tariff_code_after','zones_count_after','season_after','rate_card_id_after','rates_year_after','rates_source_after','rates_overridden_after',
      'fixed_distribution_after_total','contracted_power_charge_rate_after','variable_distribution_after_zone1_rate','variable_distribution_after_zone2_rate','variable_distribution_after_zone3_rate',
      'consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh']
    WHEN 'tariff_przed' THEN ARRAY['tariff_code_before','zones_count_before','season_before','rate_card_id_before','rates_year_before','rates_source_before','rates_overridden_before','contracted_power_before_kw',
      'fixed_distribution_before_total','contracted_power_charge_rate_before','variable_distribution_before_zone1_rate','variable_distribution_before_zone2_rate','variable_distribution_before_zone3_rate',
      'active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh']
    WHEN 'field_przed' THEN ARRAY['contracted_power_before_kw','active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','handling_fee_before','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'report_selection' THEN ARRAY['include_in_project_report']
    ELSE ARRAY[]::text[] END
$function$;

CREATE OR REPLACE FUNCTION public.ai_proposal_guard(_p ai_proposals)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR _p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Brak dostępu do tej propozycji'; END IF;
  IF NOT public.has_feature_access('ai_assistant') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Asystent AI'; END IF;
  IF _p.kind IN ('period','estimate','estimate_replace','year_simulation') AND NOT public.has_feature_access('invoice_import') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Import faktur'; END IF;
  IF _p.kind = 'report_selection' AND NOT public.has_feature_access('multi_ppe') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Analizy wielu PPE'; END IF;
  IF NOT public.can_access_analysis_group(_p.analysis_group_id) OR NOT public.ai_can_edit_analysis(_p.analysis_id) OR NOT public.can_edit_feature_group(_p.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
  IF _p.status = 'pending' AND _p.kind = 'tariff_po' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE '%_before%') THEN RAISE EXCEPTION 'Zmiana taryfy PO nie może zmieniać PRZED'; END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE 'consumption_after_%') THEN RAISE EXCEPTION 'Szacunek z faktur dotyczy wyłącznie PRZED. Przygotuj nową propozycję bez automatycznej zmiany PO'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' IN ('capacity_charge_before','reactive_energy_cost_before')) AND jsonb_array_length(_p.changes) <> 1 THEN RAISE EXCEPTION 'Każdy koszt wymaga osobnej propozycji i akceptacji'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p.estimates->'create','[]'::jsonb)) e WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e->>'field')) THEN RAISE EXCEPTION 'Szacunek nie odpowiada zatwierdzonym polom'; END IF;
  END IF;
  IF _p.status = 'pending' AND _p.kind = 'year_simulation' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' LIKE '%_after%') THEN RAISE EXCEPTION 'Symulacja okresu dotyczy wyłącznie PRZED. Przygotuj nową propozycję bez automatycznej zmiany PO'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(_p.changes) c WHERE c->>'field' IN ('capacity_charge_before','reactive_energy_cost_before')) > 1 THEN RAISE EXCEPTION 'Każdy koszt wymaga osobnej propozycji i akceptacji'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p.estimates->'create','[]'::jsonb)) e WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e->>'field')) THEN RAISE EXCEPTION 'Szacunek nie odpowiada zatwierdzonym polom'; END IF;
  END IF;
  IF _p.status = 'pending' AND _p.kind = 'estimate_replace' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(_p.estimates->'replace','[]'::jsonb)) x WHERE NOT EXISTS (SELECT 1 FROM public.analysis_estimates e WHERE e.id=x::uuid AND e.analysis_id=_p.analysis_id AND e.status='active' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_p.changes) c WHERE c->>'field'=e.field))) THEN RAISE EXCEPTION 'Zastępowany szacunek nie odpowiada tej analizie i zatwierdzonym polom'; END IF;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.ai_apply_proposal(_id uuid, _expected_updated_at timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.ai_proposals; e public.energy_analyses; rowj jsonb; vs jsonb; c jsonb; f text;
  fields jsonb := '{}'::jsonb; src jsonb; cid uuid; est jsonb;
BEGIN
  SELECT * INTO p FROM public.ai_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono propozycji'; END IF;
  PERFORM public.ai_proposal_guard(p);
  IF p.status = 'applied' THEN RETURN jsonb_build_object('status','already_applied','change_id',p.applied_change_id); END IF;
  IF p.status <> 'pending' THEN RETURN jsonb_build_object('status', p.status); END IF;
  SELECT * INTO e FROM public.energy_analyses WHERE id = p.analysis_id FOR UPDATE;
  IF e.updated_at <> p.base_updated_at OR e.updated_at <> _expected_updated_at THEN
    RETURN jsonb_build_object('status','stale'); END IF;
  rowj := to_jsonb(e); vs := coalesce(e.value_sources, '{}'::jsonb);
  src := jsonb_build_object('source','ai','proposal_id',p.id) || CASE WHEN p.kind IN ('estimate','year_simulation') THEN '{"estimate":true}'::jsonb ELSE '{}'::jsonb END;
  FOR c IN SELECT * FROM jsonb_array_elements(p.changes) LOOP
    f := c->>'field';
    IF NOT (f = ANY(public.ai_allowed_fields(p.kind))) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    fields := fields || jsonb_build_object(f, jsonb_build_object('before', rowj->f, 'after', c->'value', 'source_before', vs->f, 'source_after', src));
    EXECUTE format('UPDATE public.energy_analyses SET %I = %L WHERE id = $1', f, c->>'value') USING p.analysis_id;
    vs := jsonb_set(vs, ARRAY[f], src);
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = p.analysis_id;
  SELECT to_jsonb(x) INTO rowj FROM public.energy_analyses x WHERE x.id = p.analysis_id;
  FOR f IN SELECT jsonb_object_keys(fields) LOOP
    fields := jsonb_set(fields, ARRAY[f,'after'], rowj->f);
  END LOOP;
  INSERT INTO public.ai_applied_changes(proposal_id,user_id,analysis_group_id,analysis_id,fields,source,assumption)
    VALUES (p.id, auth.uid(), p.analysis_group_id, p.analysis_id, fields, p.source, p.assumption) RETURNING id INTO cid;
  IF p.kind IN ('estimate','year_simulation') THEN
    FOR est IN SELECT * FROM jsonb_array_elements(coalesce(p.estimates->'create','[]'::jsonb)) LOOP
      IF NOT ((est->>'field') = ANY(public.ai_allowed_fields('estimate'))) THEN RAISE EXCEPTION 'Niedozwolone pole szacunku'; END IF;
      INSERT INTO public.analysis_estimates(analysis_id,analysis_group_id,change_id,field,period_from,period_to,value,base_value,unit,method,basis,created_by)
      VALUES (p.analysis_id, p.analysis_group_id, cid, est->>'field', (est->>'period_from')::date, (est->>'period_to')::date,
        (est->>'value')::numeric, nullif(est->>'base_value','')::numeric, est->>'unit', est->>'method', coalesce(est->'basis','[]'::jsonb), auth.uid());
    END LOOP;
  ELSIF p.kind = 'estimate_replace' THEN
    UPDATE public.analysis_estimates SET status = 'replaced', replaced_change_id = cid, updated_at = now()
      WHERE analysis_id = p.analysis_id AND status = 'active'
        AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(coalesce(p.estimates->'replace','[]'::jsonb)) x);
  END IF;
  UPDATE public.ai_proposals SET status = 'applied', applied_change_id = cid, updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','applied','change_id',cid);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_undo_change(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ch public.ai_applied_changes; p public.ai_proposals; e public.energy_analyses; rowj jsonb; vs jsonb; f text; d jsonb; conflicts text[] := '{}';
BEGIN
  SELECT * INTO ch FROM public.ai_applied_changes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono zmiany'; END IF;
  SELECT * INTO p FROM public.ai_proposals WHERE id = ch.proposal_id FOR UPDATE;
  PERFORM public.ai_proposal_guard(p);
  IF ch.undone_at IS NOT NULL THEN RETURN jsonb_build_object('status','already_undone'); END IF;
  SELECT * INTO e FROM public.energy_analyses WHERE id = ch.analysis_id FOR UPDATE;
  rowj := to_jsonb(e); vs := coalesce(e.value_sources, '{}'::jsonb);
  FOR f, d IN SELECT * FROM jsonb_each(ch.fields) LOOP
    IF (rowj->f) IS DISTINCT FROM (d->'after') OR (vs->f) IS DISTINCT FROM (d->'source_after') THEN conflicts := conflicts || f; END IF;
  END LOOP;
  IF array_length(conflicts, 1) > 0 THEN RETURN jsonb_build_object('status','conflict','fields',to_jsonb(conflicts)); END IF;
  FOR f, d IN SELECT * FROM jsonb_each(ch.fields) LOOP
    IF NOT (f = ANY(public.ai_allowed_fields(p.kind))) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    EXECUTE format('UPDATE public.energy_analyses SET %I = %L WHERE id = $1', f, d->>'before') USING ch.analysis_id;
    vs := CASE WHEN d->'source_before' IS NULL OR d->'source_before' = 'null'::jsonb THEN vs - f ELSE jsonb_set(vs, ARRAY[f], d->'source_before') END;
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = ch.analysis_id;
  IF p.kind IN ('estimate','year_simulation') THEN
    UPDATE public.analysis_estimates SET status = 'undone', updated_at = now() WHERE change_id = ch.id AND status = 'active';
  ELSIF p.kind = 'estimate_replace' THEN
    UPDATE public.analysis_estimates SET status = 'active', replaced_change_id = NULL, updated_at = now() WHERE replaced_change_id = ch.id;
  END IF;
  UPDATE public.ai_applied_changes SET undone_at = now(), undone_by = auth.uid() WHERE id = ch.id;
  UPDATE public.ai_proposals SET status = 'undone', updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','undone');
END $function$;