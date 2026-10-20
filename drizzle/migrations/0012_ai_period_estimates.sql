ALTER TABLE public.ai_proposals ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'po';
ALTER TABLE public.ai_proposals ADD COLUMN IF NOT EXISTS estimates jsonb;
ALTER TABLE public.ai_proposals ADD CONSTRAINT ai_proposals_kind_check CHECK (kind IN ('po','period','estimate','estimate_replace'));

CREATE TABLE public.analysis_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.energy_analyses(id) ON DELETE CASCADE,
  analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
  change_id uuid REFERENCES public.ai_applied_changes(id) ON DELETE SET NULL,
  field text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  value numeric NOT NULL,
  base_value numeric,
  unit text NOT NULL,
  method text NOT NULL,
  basis jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','undone','replaced')),
  replaced_change_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analysis_estimates TO authenticated;
GRANT ALL ON public.analysis_estimates TO service_role;
ALTER TABLE public.analysis_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Estimates readable with group access" ON public.analysis_estimates FOR SELECT TO authenticated
  USING (public.can_access_analysis_group(analysis_group_id));
CREATE INDEX analysis_estimates_analysis_idx ON public.analysis_estimates(analysis_id, status);

CREATE OR REPLACE FUNCTION public.ai_allowed_fields(_kind text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _kind
    WHEN 'po' THEN public.ai_allowed_po_fields()
    WHEN 'period' THEN ARRAY['period_from','period_to']
    WHEN 'estimate' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh',
      'consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'estimate_replace' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh',
      'consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    ELSE ARRAY[]::text[] END
$$;

CREATE OR REPLACE FUNCTION public.ai_proposal_guard(_p ai_proposals) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR _p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Brak dostępu do tej propozycji'; END IF;
  IF NOT public.has_feature_access('ai_assistant') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Asystent AI'; END IF;
  IF _p.kind <> 'po' AND NOT public.has_feature_access('invoice_import') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Import faktur'; END IF;
  IF NOT public.can_access_analysis_group(_p.analysis_group_id) OR NOT public.ai_can_edit_analysis(_p.analysis_id)
     OR NOT public.can_edit_feature_group(_p.analysis_group_id) THEN
    RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_apply_proposal(_id uuid, _expected_updated_at timestamp with time zone) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  src := jsonb_build_object('source','ai','proposal_id',p.id) || CASE WHEN p.kind IN ('estimate') THEN '{"estimate":true}'::jsonb ELSE '{}'::jsonb END;
  FOR c IN SELECT * FROM jsonb_array_elements(p.changes) LOOP
    f := c->>'field';
    IF NOT (f = ANY(public.ai_allowed_fields(p.kind))) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    fields := fields || jsonb_build_object(f, jsonb_build_object('before', rowj->f, 'after', c->'value', 'source_before', vs->f, 'source_after', src));
    EXECUTE format('UPDATE public.energy_analyses SET %I = %L WHERE id = $1', f, c->>'value') USING p.analysis_id;
    vs := jsonb_set(vs, ARRAY[f], src);
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = p.analysis_id;
  -- normalise 'after' to what the column stored, so undo conflict checks compare like with like
  SELECT to_jsonb(x) INTO rowj FROM public.energy_analyses x WHERE x.id = p.analysis_id;
  FOR f IN SELECT jsonb_object_keys(fields) LOOP
    fields := jsonb_set(fields, ARRAY[f,'after'], rowj->f);
  END LOOP;
  INSERT INTO public.ai_applied_changes(proposal_id,user_id,analysis_group_id,analysis_id,fields,source,assumption)
    VALUES (p.id, auth.uid(), p.analysis_group_id, p.analysis_id, fields, p.source, p.assumption) RETURNING id INTO cid;
  IF p.kind = 'estimate' THEN
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
END $$;

CREATE OR REPLACE FUNCTION public.ai_undo_change(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    IF (rowj->>f) IS DISTINCT FROM (d->>'after') OR (vs->f) IS DISTINCT FROM (d->'source_after') THEN conflicts := conflicts || f; END IF;
  END LOOP;
  IF array_length(conflicts, 1) > 0 THEN RETURN jsonb_build_object('status','conflict','fields',to_jsonb(conflicts)); END IF;
  FOR f, d IN SELECT * FROM jsonb_each(ch.fields) LOOP
    IF NOT (f = ANY(public.ai_allowed_fields(p.kind))) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    EXECUTE format('UPDATE public.energy_analyses SET %I = %L WHERE id = $1', f, d->>'before') USING ch.analysis_id;
    vs := CASE WHEN d->'source_before' IS NULL OR d->'source_before' = 'null'::jsonb THEN vs - f ELSE jsonb_set(vs, ARRAY[f], d->'source_before') END;
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = ch.analysis_id;
  IF p.kind = 'estimate' THEN
    UPDATE public.analysis_estimates SET status = 'undone', updated_at = now() WHERE change_id = ch.id AND status = 'active';
  ELSIF p.kind = 'estimate_replace' THEN
    UPDATE public.analysis_estimates SET status = 'active', replaced_change_id = NULL, updated_at = now() WHERE replaced_change_id = ch.id;
  END IF;
  UPDATE public.ai_applied_changes SET undone_at = now(), undone_by = auth.uid() WHERE id = ch.id;
  UPDATE public.ai_proposals SET status = 'undone', updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','undone');
END $$;