CREATE TABLE public.ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.energy_analyses(id) ON DELETE CASCADE,
  changes jsonb NOT NULL,
  before jsonb NOT NULL,
  base_updated_at timestamptz NOT NULL,
  source text NOT NULL,
  assumption text,
  is_simulation boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','undone')),
  applied_change_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_applied_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.ai_proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.energy_analyses(id) ON DELETE CASCADE,
  fields jsonb NOT NULL,
  source text NOT NULL,
  assumption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid
);
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.ai_proposals(id) ON DELETE SET NULL;
CREATE INDEX ON public.ai_proposals(analysis_id);
CREATE INDEX ON public.ai_applied_changes(analysis_group_id, created_at);

GRANT SELECT ON public.ai_proposals, public.ai_applied_changes TO authenticated;
GRANT ALL ON public.ai_proposals, public.ai_applied_changes TO service_role;
ALTER TABLE public.ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_applied_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own proposals with current access" ON public.ai_proposals FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_feature_access('ai_assistant') AND public.can_access_analysis_group(analysis_group_id));
CREATE POLICY "Own applied changes with current access" ON public.ai_applied_changes FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_feature_access('ai_assistant') AND public.can_access_analysis_group(analysis_group_id));

-- Mirrors the UPDATE policies on energy_analyses.
CREATE OR REPLACE FUNCTION public.ai_can_edit_analysis(_analysis_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_app_owner() OR EXISTS (
    SELECT 1 FROM public.energy_analyses e JOIN public.client_projects cp ON cp.id = e.client_project_id
    WHERE e.id = _analysis_id AND (cp.created_by_user_id = auth.uid() OR public.is_manager_of(cp.created_by_user_id)))
$$;

CREATE OR REPLACE FUNCTION public.ai_allowed_po_fields()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['active_energy_price_after_zone1','active_energy_price_after_zone2','active_energy_price_after_zone3',
    'contracted_power_after_kw','handling_fee_after','capacity_charge_after','reactive_energy_cost_after','fixed_distribution_after_total']
$$;

CREATE OR REPLACE FUNCTION public.ai_proposal_guard(_p public.ai_proposals)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR _p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Brak dostępu do tej propozycji'; END IF;
  IF NOT public.has_feature_access('ai_assistant') THEN RAISE EXCEPTION 'Brak dostępu do funkcji Asystent AI'; END IF;
  IF NOT public.can_access_analysis_group(_p.analysis_group_id) OR NOT public.ai_can_edit_analysis(_p.analysis_id) THEN
    RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_reject_proposal(_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.ai_proposals;
BEGIN
  SELECT * INTO p FROM public.ai_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono propozycji'; END IF;
  PERFORM public.ai_proposal_guard(p);
  IF p.status <> 'pending' THEN RETURN p.status; END IF;
  UPDATE public.ai_proposals SET status = 'rejected', updated_at = now() WHERE id = _id;
  RETURN 'rejected';
END $$;

-- Rebase a stale proposal on the current data (user must approve again).
CREATE OR REPLACE FUNCTION public.ai_refresh_proposal(_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.ai_proposals; rowj jsonb; ts timestamptz; nb jsonb := '{}'::jsonb; c jsonb;
BEGIN
  SELECT * INTO p FROM public.ai_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono propozycji'; END IF;
  PERFORM public.ai_proposal_guard(p);
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Propozycja nie oczekuje już na decyzję'; END IF;
  SELECT to_jsonb(e), e.updated_at INTO rowj, ts FROM public.energy_analyses e WHERE e.id = p.analysis_id;
  FOR c IN SELECT * FROM jsonb_array_elements(p.changes) LOOP
    nb := nb || jsonb_build_object(c->>'field', rowj->(c->>'field'));
  END LOOP;
  UPDATE public.ai_proposals SET before = nb, base_updated_at = ts, updated_at = now() WHERE id = _id;
  RETURN ts;
END $$;

CREATE OR REPLACE FUNCTION public.ai_apply_proposal(_id uuid, _expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.ai_proposals; e public.energy_analyses; rowj jsonb; vs jsonb; c jsonb; f text; v numeric;
  fields jsonb := '{}'::jsonb; src jsonb; cid uuid;
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
  src := jsonb_build_object('source','ai','proposal_id',p.id);
  FOR c IN SELECT * FROM jsonb_array_elements(p.changes) LOOP
    f := c->>'field'; v := (c->>'value')::numeric;
    IF NOT (f = ANY(public.ai_allowed_po_fields())) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    fields := fields || jsonb_build_object(f, jsonb_build_object('before', rowj->f, 'after', to_jsonb(v), 'source_before', vs->f, 'source_after', src));
    EXECUTE format('UPDATE public.energy_analyses SET %I = $1 WHERE id = $2', f) USING v, p.analysis_id;
    vs := jsonb_set(vs, ARRAY[f], src);
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = p.analysis_id;
  INSERT INTO public.ai_applied_changes(proposal_id,user_id,analysis_group_id,analysis_id,fields,source,assumption)
    VALUES (p.id, auth.uid(), p.analysis_group_id, p.analysis_id, fields, p.source, p.assumption) RETURNING id INTO cid;
  UPDATE public.ai_proposals SET status = 'applied', applied_change_id = cid, updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','applied','change_id',cid);
END $$;

CREATE OR REPLACE FUNCTION public.ai_undo_change(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    IF NOT (f = ANY(public.ai_allowed_po_fields())) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    EXECUTE format('UPDATE public.energy_analyses SET %I = $1 WHERE id = $2', f) USING (d->>'before')::numeric, ch.analysis_id;
    vs := CASE WHEN d->'source_before' IS NULL OR d->'source_before' = 'null'::jsonb THEN vs - f ELSE jsonb_set(vs, ARRAY[f], d->'source_before') END;
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = ch.analysis_id;
  UPDATE public.ai_applied_changes SET undone_at = now(), undone_by = auth.uid() WHERE id = ch.id;
  UPDATE public.ai_proposals SET status = 'undone', updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','undone');
END $$;

REVOKE EXECUTE ON FUNCTION public.ai_proposal_guard(public.ai_proposals) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_reject_proposal(uuid), public.ai_refresh_proposal(uuid), public.ai_apply_proposal(uuid, timestamptz), public.ai_undo_change(uuid), public.ai_can_edit_analysis(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_reject_proposal(uuid), public.ai_refresh_proposal(uuid), public.ai_apply_proposal(uuid, timestamptz), public.ai_undo_change(uuid) FROM anon;